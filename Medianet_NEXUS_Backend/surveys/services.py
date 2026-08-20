"""
surveys/services.py

Same pattern as customers/services.py: plain functions returning
dicts/lists, called from thin @api_view views. Three kinds of data here:
  - SurveyTemplate / SurveyQuestion / ClientContact / Survey / SurveyVerdict:
    Django ORM (this app owns them)
  - Dim_Company.Industry lookup: raw SQL against the warehouse (read-only,
    same pattern as customers/services.py) — needed to make template
    selection "smart" instead of manual.
  - AI verdict generation: Gen_BI.services.llm_client.chat() (Groq -> Mistral chain),
    grounded in a survey's actual responses.
"""

import json
import logging
import os
import re

from db import get_warehouse_conn, release_warehouse_conn
from django.conf import settings
from django.core.mail import send_mail
from django.core.exceptions import ValidationError
from django.db.models import Max
from django.utils import timezone
import datetime
from .models import (
    SurveyTemplate, SurveyQuestion, ClientContact, Industry, ServiceCategory,
    Survey, SurveyResponse, SurveyStatus, Notification, NotificationEventType,
    SurveyVerdict, VerdictStatus, QuestionOrigin, SurveyCleanupRun,
)

logger = logging.getLogger("surveys")


# ── Template CRUD ────────────────────────────────────────────────────────

def list_templates(industry: str | None = None, service_category: str | None = None, active_only: bool = True) -> list[dict]:
    """Excludes prepared-drafts by default — those are per-company and only
    shown in the Prepare Survey review step, not the main template list."""
    qs = SurveyTemplate.objects.filter(is_prepared_draft=False)
    if active_only:
        qs = qs.filter(is_active=True)
    if industry:
        qs = qs.filter(industry=industry)
    if service_category:
        qs = qs.filter(service_category=service_category)
    return [_template_summary(t) for t in qs]


def get_template_detail(template_id: int) -> dict | None:
    try:
        t = SurveyTemplate.objects.prefetch_related("questions").get(id=template_id)
    except SurveyTemplate.DoesNotExist:
        return None
    data = _template_summary(t)
    # All questions, active + inactive — the template editor needs to show
    # deactivated ones (grayed out) so it's clear why they can't be deleted.
    data["questions"] = [_question_summary(q) for q in t.questions.all().order_by("order")]
    return data


def create_template(payload: dict) -> dict:
    t = SurveyTemplate.objects.create(
        name=payload["name"],
        industry=payload.get("industry", Industry.OTHER),
        service_category=payload.get("service_category", ServiceCategory.OTHER),
        description=payload.get("description", ""),
        is_default=payload.get("is_default", False),
        is_active=payload.get("is_active", True),
    )
    _enforce_single_default(t)
    return get_template_detail(t.id)


def update_template(template_id: int, payload: dict) -> dict | None:
    try:
        t = SurveyTemplate.objects.get(id=template_id)
    except SurveyTemplate.DoesNotExist:
        return None
    for field in ["name", "industry", "service_category", "description", "is_default", "is_active"]:
        if field in payload:
            setattr(t, field, payload[field])
    t.save()
    _enforce_single_default(t)
    return get_template_detail(t.id)


def deactivate_template(template_id: int) -> bool:
    updated = SurveyTemplate.objects.filter(id=template_id).update(is_active=False)
    return updated > 0


def _enforce_single_default(t: SurveyTemplate) -> None:
    """Only one is_default=True template should be active at a time — it's the catch-all fallback."""
    if t.is_default:
        SurveyTemplate.objects.exclude(id=t.id).filter(is_default=True).update(is_default=False)


def _template_summary(t: SurveyTemplate) -> dict:
    return {
        "id": t.id,
        "name": t.name,
        "industry": t.industry,
        "industryLabel": t.get_industry_display(),
        "serviceCategory": t.service_category,
        "serviceCategoryLabel": t.get_service_category_display(),
        "description": t.description,
        "isDefault": t.is_default,
        "isActive": t.is_active,
        "isPreparedDraft": t.is_prepared_draft,
        "preparedForCodeCompany": t.prepared_for_code_company,
        "questionCount": t.questions.filter(is_active=True).count() if t.pk else 0,
        "createdAt": t.created_at.isoformat() if t.created_at else None,
    }


# ── Question CRUD ────────────────────────────────────────────────────────

def add_question(template_id: int, payload: dict) -> dict | None:
    try:
        t = SurveyTemplate.objects.get(id=template_id)
    except SurveyTemplate.DoesNotExist:
        return None
    next_order = payload.get("order")
    if next_order is None:
        last = t.questions.order_by("-order").first()
        next_order = (last.order + 1) if last else 0
    q = SurveyQuestion.objects.create(
        template=t,
        order=next_order,
        text=payload["text"],
        question_type=payload.get("question_type", "rating_5"),
        options=payload.get("options"),
        scoring_dimension=payload.get("scoring_dimension", "none"),
        weight=payload.get("weight", 1.0),
        is_required=payload.get("is_required", True),
        is_active=payload.get("is_active", True),
        origin=payload.get("origin", QuestionOrigin.MANUAL),
        depends_on_question_id=payload.get("depends_on_question"),
        show_if_min_value=payload.get("show_if_min_value"),
        excludes_selected_from_id=payload.get("excludes_selected_from"),
    )
    return _question_summary(q)


def update_question(question_id: int, payload: dict) -> dict | None:
    try:
        q = SurveyQuestion.objects.get(id=question_id)
    except SurveyQuestion.DoesNotExist:
        return None
    for field in ["order", "text", "question_type", "options", "scoring_dimension", "weight", "is_required", "is_active"]:
        if field in payload:
            setattr(q, field, payload[field])
    if "depends_on_question" in payload:
        q.depends_on_question_id = payload["depends_on_question"]
    if "show_if_min_value" in payload:
        q.show_if_min_value = payload["show_if_min_value"]
    if "excludes_selected_from" in payload:
        q.excludes_selected_from_id = payload["excludes_selected_from"]
    q.save()
    return _question_summary(q)


def delete_question(question_id: int) -> dict | None:
    """
    Safe delete: a question that has ever been answered is deactivated
    instead of removed, because SurveyResponse.question is CASCADE and a
    hard delete would silently wipe every past answer tied to it. Only a
    never-answered question is actually deleted.
    Returns None if the question doesn't exist, otherwise
    {"deleted": bool, "deactivated": bool}.
    """
    try:
        q = SurveyQuestion.objects.get(id=question_id)
    except SurveyQuestion.DoesNotExist:
        return None

    has_responses = SurveyResponse.objects.filter(question_id=question_id).exists()
    if has_responses:
        q.is_active = False
        q.save(update_fields=["is_active"])
        return {"deleted": False, "deactivated": True}

    q.delete()
    return {"deleted": True, "deactivated": False}


def _question_summary(q: SurveyQuestion) -> dict:
    return {
        "id": q.id,
        "templateId": q.template_id,
        "order": q.order,
        "text": q.text,
        "questionType": q.question_type,
        "options": q.options,
        "scoringDimension": q.scoring_dimension,
        "weight": q.weight,
        "isRequired": q.is_required,
        "isActive": q.is_active,
        "origin": q.origin,
        "dependsOnQuestion": q.depends_on_question_id,
        "showIfMinValue": q.show_if_min_value,
        "excludesSelectedFrom": q.excludes_selected_from_id,
    }


# ── Smart resolution: DW industry -> best template ──────────────────────

def _get_company_industry(code_company: str) -> str | None:
    """Raw-SQL lookup against the warehouse — same connection pattern as customers/services.py."""
    conn = get_warehouse_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                # Explicit ::text cast on both sides — code_company's real
                # column type in the DW isn't guaranteed (could be int or
                # varchar depending on how Talend loaded it), and we don't
                # want a type-mismatch error either way.
                'SELECT "Industry" FROM public."Dim_Company" WHERE code_company::text = %s::text LIMIT 1;',
                [str(code_company)],
            )
            row = cur.fetchone()
            return row["Industry"] if row else None
    finally:
        release_warehouse_conn(conn)


_INDUSTRY_EXACT_MAP = {
    # Exact DW Dim_Company.Industry values -> our Industry choices. Direct
    # match now that we have the real values (was a fuzzy keyword guess
    # before) — case/whitespace-insensitive on the DW side just in case.
    "manufacturing": Industry.MANUFACTURING,
    "services": Industry.SERVICES,
    "tourism": Industry.TOURISM,
    "food & beverage": Industry.FOOD_BEVERAGE,
    "ngo & development organization": Industry.NGO_DEVELOPMENT,
    "banking": Industry.BANKING,
    "education": Industry.EDUCATION,
    "advertising & marketing": Industry.ADVERTISING_MARKETING,
    "staffing & recruitment": Industry.STAFFING_RECRUITMENT,
    "telecom": Industry.TELECOM,
    "postal services": Industry.POSTAL_SERVICES,
}


def _map_dw_industry_to_choice(dw_industry: str | None) -> str:
    """DW's Industry column holds real values now — exact match (trimmed,
    case-insensitive) against the curated list. Anything not in that list
    (industry not yet built out) falls back to OTHER."""
    if not dw_industry:
        return Industry.OTHER
    return _INDUSTRY_EXACT_MAP.get(dw_industry.strip().lower(), Industry.OTHER)


def resolve_template_for_company(code_company: str, service_category: str | None = None) -> dict | None:
    """
    The "smart" part: given a company, find its DW industry, map it onto
    our template industries, and pick the best active match — same
    industry + service_category first, then same industry only, then
    the generic is_default template.
    """
    dw_industry = _get_company_industry(code_company)
    mapped_industry = _map_dw_industry_to_choice(dw_industry)

    qs = SurveyTemplate.objects.filter(is_active=True, is_prepared_draft=False)

    if service_category:
        exact = qs.filter(industry=mapped_industry, service_category=service_category).first()
        if exact:
            return {**_template_summary(exact), "matchedOn": "industry+service", "dwIndustry": dw_industry}

    industry_match = qs.filter(industry=mapped_industry).first()
    if industry_match:
        return {**_template_summary(industry_match), "matchedOn": "industry", "dwIndustry": dw_industry}

    default = qs.filter(is_default=True).first()
    if default:
        return {**_template_summary(default), "matchedOn": "default_fallback", "dwIndustry": dw_industry}

    return None


# ── Prepare Survey (per-company dynamic assembly) ───────────────────────

def list_companies_with_subs() -> list[dict]:
    """
    Companies that actually have at least one subscription — the picker
    for 'Prepare Survey' only offers real clients, not every placeholder
    row in Dim_Company. Same join pattern as customers/get_customers_list().
    """
    conn = get_warehouse_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                        SELECT DISTINCT dc.code_company::text AS code_company,
                            dc."company"          AS name,
                                        dc."Industry"          AS industry
                        FROM public."Dim_Company" dc
                                 INNER JOIN public."Fact_Subscription" fs ON fs."ID_Company" = dc."ID_Company"
                        WHERE dc."company" IS NOT NULL
                        ORDER BY dc."company"
                        """)
            return [
                {
                    "codeCompany": r["code_company"],
                    "companyName": r["name"],
                    "dwIndustry": r["industry"],
                }
                for r in cur.fetchall()
            ]
    finally:
        release_warehouse_conn(conn)


def _get_company_subscription_facts(code_company: str) -> list[dict]:
    """Raw subscription facts for one company — the only grounding data
    the AI question generator is allowed to use (subscriptions only, per
    the current scope; deals may be added later)."""
    conn = get_warehouse_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                        SELECT fs.tenure_months, fs.monthly_amount, fs.annual_amount,
                               fs.total_usage_events, fs.is_trial, fs.upgrade_flag,
                               fs.downgrade_flag, fs."Churn_flag", fs.auto_renew_flag,
                               fs.is_active
                        FROM public."Fact_Subscription" fs
                                 INNER JOIN public."Dim_Company" dc ON dc."ID_Company" = fs."ID_Company"
                        WHERE dc.code_company::text = %s::text
                        """, [str(code_company)])
            return [dict(r) for r in cur.fetchall()]
    finally:
        release_warehouse_conn(conn)


_AI_QUESTION_SYSTEM_PROMPT = (
    "You are a Customer Success survey designer. Given one client's raw "
    "subscription history (plan tenure, billing amounts, usage events, "
    "trial/upgrade/downgrade/renewal flags), write 2-3 survey questions "
    "personalized to what THIS client's data actually shows — e.g. if they "
    "have a long tenure, ask about long-term satisfaction; if they upgraded "
    "recently, ask how the upgrade is working out; if usage is low, ask "
    "what's getting in the way. Respond with STRICT JSON only — a list, no "
    "markdown fences, no preamble. Schema per item:\n"
    '{"text": "the question, written for the client to read", '
    '"question_type": "rating_5|rating_10|nps|yes_no|open_text", '
    '"scoring_dimension": "satisfaction|loyalty|upsell_readiness|none", '
    '"weight": 1.0}\n'
    "Never invent facts not present in the data. If the data is too thin to "
    "personalize meaningfully, return fewer questions rather than generic ones."
)


def _generate_ai_questions_for_company(code_company: str) -> list[dict]:
    """Calls the LLM grounded in this company's subscription facts. Returns
    a list of question dicts ready to become SurveyQuestion rows. Returns an
    empty list (never raises) if generation fails after retrying —
    prepare_survey_for_company should still succeed with just default+
    industry questions in that case."""
    facts = _get_company_subscription_facts(code_company)
    if not facts:
        return []

    prompt = [
        {"role": "system", "content": _AI_QUESTION_SYSTEM_PROMPT},
        {"role": "user", "content": f"Subscription history (one row per subscription): {facts}"},
    ]

    for attempt in range(2):  # one retry — malformed JSON here is usually transient, not systematic
        try:
            from Gen_BI.services.llm_client import chat as llm_chat
            raw = llm_chat(prompt, max_tokens=500, temperature=0.3)
            parsed = _parse_verdict_json(raw)  # same tolerant JSON parser used by the verdict engine
            if isinstance(parsed, dict):
                parsed = parsed.get("questions", [])
            return parsed if isinstance(parsed, list) else []
        except Exception as e:  # noqa: BLE001 — best-effort, never blocks prepare
            logger.warning("AI question generation attempt %s failed for company %s: %s", attempt + 1, code_company, e)

    return []


def _get_company_name(code_company: str) -> str:
    conn = get_warehouse_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                'SELECT "company" FROM public."Dim_Company" WHERE code_company::text = %s::text LIMIT 1;',
                [str(code_company)],
            )
            row = cur.fetchone()
            return row["company"] if row else code_company
    finally:
        release_warehouse_conn(conn)


def _clone_questions_with_remap(source_questions, draft: SurveyTemplate, origin: str, order_start: int):
    """
    Clones questions onto `draft`, preserving depends_on_question /
    excludes_selected_from relationships BETWEEN the cloned questions
    themselves — e.g. the two upsell follow-ups on the default template
    still point at each other and at the gate question after cloning,
    just via their new row ids instead of the source template's ids.

    Returns (upsell_gate_question_id, next_order). upsell_gate_question_id
    is the id of whichever cloned question is a standalone (non-dependent)
    upsell_readiness rating question, or None if there wasn't one in this
    batch — used so a later stage (industry questions, if ever gated the
    same way) could hook onto the same gate.
    """
    id_map: dict[int, int] = {}
    pairs: list[tuple[SurveyQuestion, SurveyQuestion]] = []
    order = order_start

    for q in source_questions:
        clone = SurveyQuestion.objects.create(
            template=draft, order=order, text=q.text, question_type=q.question_type,
            options=q.options, scoring_dimension=q.scoring_dimension, weight=q.weight,
            is_required=q.is_required, origin=origin, show_if_min_value=q.show_if_min_value,
        )
        id_map[q.id] = clone.id
        pairs.append((q, clone))
        order += 1

    upsell_gate_id: int | None = None
    for source, clone in pairs:
        update_fields = []
        if source.depends_on_question_id in id_map:
            clone.depends_on_question_id = id_map[source.depends_on_question_id]
            update_fields.append("depends_on_question")
        if source.excludes_selected_from_id in id_map:
            clone.excludes_selected_from_id = id_map[source.excludes_selected_from_id]
            update_fields.append("excludes_selected_from")
        if update_fields:
            clone.save(update_fields=update_fields)
        if (
                source.depends_on_question_id is None
                and source.scoring_dimension == "upsell_readiness"
                and source.question_type in ("rating_5", "rating_10")
        ):
            upsell_gate_id = clone.id

    return upsell_gate_id, order


def prepare_survey_for_company(code_company: str, regenerate: bool = False) -> dict:
    """
    Stage 1 of Prepare Survey: assembles the BASE draft — default template
    questions (including its two conditional upsell follow-ups, cloned with
    their branching relationships intact) plus industry questions, auto-
    resolved from the company's real DW industry. No manual industry
    choice — if the company's industry isn't in the curated list, it just
    gets default questions only.

    AI-generated questions are NOT added here — that's a separate,
    explicit step (add_ai_questions_to_prepared_survey), so you can review
    the base draft before deciding to layer AI questions on top.

    Reused on repeat calls unless regenerate=True. If the existing draft
    was already used to send a real survey, always rebuilds fresh (see
    already_sent handling below) regardless of the regenerate flag.
    """
    existing = SurveyTemplate.objects.filter(prepared_for_code_company=code_company).first()
    already_sent = bool(existing and Survey.objects.filter(template=existing).exists())
    if existing and not regenerate and not already_sent:
        return get_template_detail(existing.id)

    dw_industry = _get_company_industry(code_company)
    mapped_industry = _map_dw_industry_to_choice(dw_industry)
    company_name = _get_company_name(code_company)

    if existing and already_sent:
        # CRITICAL: this draft's questions are permanently linked to a real
        # survey's real client answers (SurveyResponse.question is CASCADE)
        # — deleting them would silently destroy that history. Detach it
        # from the "standing draft" slot instead of touching it, and build
        # a brand new draft underneath for the next round.
        existing.prepared_for_code_company = None
        existing.save(update_fields=["prepared_for_code_company"])
        existing = None

    draft, just_created = SurveyTemplate.objects.get_or_create(
        prepared_for_code_company=code_company,
        defaults={
            "name": f"Customer Success Survey — {company_name}",
            "industry": mapped_industry,
            "service_category": ServiceCategory.OTHER,
            "description": f"Auto-assembled for {company_name}. Review and edit before sending.",
            "is_default": False,
            "is_active": True,
            "is_prepared_draft": True,
        },
    )
    if existing and not just_created:
        draft.name = f"Customer Success Survey — {company_name}"
        draft.industry = mapped_industry
        draft.save(update_fields=["name", "industry"])
        draft.questions.all().delete()

    order = 0
    default_template = SurveyTemplate.objects.filter(is_default=True, is_active=True).first()
    if default_template:
        _, order = _clone_questions_with_remap(
            default_template.questions.filter(is_active=True).order_by("order"),
            draft, QuestionOrigin.DEFAULT, order,
        )

    if mapped_industry != Industry.OTHER:
        industry_template = (
            SurveyTemplate.objects
            .filter(industry=mapped_industry, is_active=True, is_default=False, is_prepared_draft=False)
            .first()
        )
        if industry_template:
            _, order = _clone_questions_with_remap(
                industry_template.questions.filter(is_active=True).order_by("order"),
                draft, QuestionOrigin.INDUSTRY, order,
            )

    return get_template_detail(draft.id)


def add_ai_questions_to_prepared_survey(code_company: str) -> dict:
    """
    Stage 2 of Prepare Survey: the "Prepare AI questions" button. Appends
    AI-generated questions (grounded in this company's subscription
    history) to an EXISTING prepared draft, after the default+industry
    questions are already there. Calling this again REPLACES the previous
    AI-generated batch rather than piling up duplicates — regenerating
    just the AI layer without touching the rest of the draft.

    Raises ValueError if no draft exists yet (call prepare_survey_for_company first).
    """
    draft = SurveyTemplate.objects.filter(prepared_for_code_company=code_company).first()
    if not draft:
        raise ValueError("No prepared draft exists for this company yet — run Prepare first.")

    draft.questions.filter(origin=QuestionOrigin.AI_GENERATED).delete()
    last_order = draft.questions.aggregate(Max("order"))["order__max"]
    next_order = (last_order + 1) if last_order is not None else 0

    for aq in _generate_ai_questions_for_company(code_company):
        try:
            SurveyQuestion.objects.create(
                template=draft, order=next_order,
                text=aq["text"], question_type=aq.get("question_type", "rating_5"),
                scoring_dimension=aq.get("scoring_dimension", "none"),
                weight=aq.get("weight", 1.0), is_required=False,
                origin=QuestionOrigin.AI_GENERATED,
            )
            next_order += 1
        except (KeyError, TypeError):
            continue  # skip a malformed item rather than failing the whole batch

    return get_template_detail(draft.id)


# ── Client contacts (Django/Postgres, per project decision) ─────────────

def list_contacts(code_company: str) -> list[dict]:
    qs = ClientContact.objects.filter(code_company=code_company, is_active=True)
    return [_contact_summary(c) for c in qs]


def create_contact(payload: dict) -> dict:
    c = ClientContact.objects.create(
        code_company=payload["code_company"],
        full_name=payload["full_name"],
        email=payload["email"],
        role_title=payload.get("role_title", ""),
        is_primary=payload.get("is_primary", False),
    )
    if c.is_primary:
        ClientContact.objects.exclude(id=c.id).filter(code_company=c.code_company).update(is_primary=False)
    return _contact_summary(c)


def update_contact(contact_id: int, payload: dict) -> dict | None:
    try:
        c = ClientContact.objects.get(id=contact_id)
    except ClientContact.DoesNotExist:
        return None
    for field in ["full_name", "email", "role_title", "is_primary", "is_active"]:
        if field in payload:
            setattr(c, field, payload[field])
    c.save()
    if c.is_primary:
        ClientContact.objects.exclude(id=c.id).filter(code_company=c.code_company).update(is_primary=False)
    return _contact_summary(c)


def delete_contact(contact_id: int) -> bool:
    updated = ClientContact.objects.filter(id=contact_id).update(is_active=False)
    return updated > 0


def _contact_summary(c: ClientContact) -> dict:
    return {
        "id": c.id,
        "codeCompany": c.code_company,
        "fullName": c.full_name,
        "email": c.email,
        "roleTitle": c.role_title,
        "isPrimary": c.is_primary,
        "isActive": c.is_active,
    }


# ── Sending a survey ──────────────────────────────────────────────────

def create_and_send_survey(template_id: int, contact_id: int, expires_in_days: int = 14, sent_by_email: str = "") -> dict:
    """
    Creates a Survey instance (a real row, with a unique token) and
    emails the contact a link to fill it. Raises ValueError on anything
    the caller did wrong (bad ids, inactive records) so the view can
    turn that into a clean 400 instead of a 500.

    sent_by_email: whoever's logged in on the frontend at send-time (Django
    has no auth of its own, so this has to be passed in) — stored on the
    Survey and later used as the default recipient for the AI next-steps
    report when the client completes it.
    """
    try:
        template = SurveyTemplate.objects.get(id=template_id, is_active=True)
    except SurveyTemplate.DoesNotExist:
        raise ValueError("Template not found or inactive.")
    if not template.is_prepared_draft:
        raise ValueError(
            "The default and industry templates are building blocks only — they can never be "
            "sent directly. Use Prepare Survey for a specific company first."
        )
    try:
        contact = ClientContact.objects.get(id=contact_id, is_active=True)
    except ClientContact.DoesNotExist:
        raise ValueError("Contact not found or inactive.")

    survey = Survey.objects.create(
        template=template,
        code_company=contact.code_company,
        contact=contact,
        status=SurveyStatus.SENT,
        sent_at=timezone.now(),
        sent_by_email=sent_by_email or "",
        expires_at=timezone.now() + datetime.timedelta(days=expires_in_days),
    )

    company_name = _get_company_name(contact.code_company)
    link = f"{settings.FRONTEND_URL}/survey/{survey.token}"
    subject = f"MEDIANET — {template.name}"

    plain_body = (
        f"Hi {contact.full_name},\n\n"
        f"We'd love your feedback on our work together with {company_name}. It only takes "
        f"a couple of minutes — please use the link below:\n\n"
        f"{link}\n\n"
        f"This link expires in {expires_in_days} days.\n\n"
        f"Thank you,\nMEDIANET Customer Success"
    )

    logo_html = (
        '<p style="font-size:13px; font-weight:bold; letter-spacing:1px; color:#F5A623; '
        'text-transform:uppercase; margin-bottom:18px;">MEDIA<span style="color:#00AADD;">NET</span></p>'
    )
    html_body = f"""
    <div style="font-family: Arial, sans-serif; color:#182860; max-width:520px; margin:0 auto;">
      {logo_html}
      <h2 style="margin-top:0; margin-bottom:6px;">We'd love your feedback</h2>
      <p style="color:#333; line-height:1.6;">
        Hi {contact.full_name},<br/><br/>
        We'd love to hear how things are going with MEDIANET at <strong>{company_name}</strong>.
        It only takes a couple of minutes to share your thoughts.
      </p>
      <div style="text-align:center; margin:28px 0;">
        <a href="{link}" style="background:#00AADD; color:white; text-decoration:none; font-weight:bold;
                                  padding:12px 28px; border-radius:6px; display:inline-block; font-size:14px;">
          Take the Survey
        </a>
      </div>
      <p style="color:#888; font-size:12px; text-align:center;">This link expires in {expires_in_days} days.</p>
      <p style="color:#333; margin-top:24px;">Thank you,<br/>MEDIANET Customer Success</p>
    </div>
    """

    from django.core.mail import EmailMultiAlternatives

    email = EmailMultiAlternatives(subject, plain_body, settings.DEFAULT_FROM_EMAIL, [contact.email])
    email.attach_alternative(html_body, "text/html")
    email.send(fail_silently=False)

    notify(
        event_type=NotificationEventType.SURVEY_SENT,
        title=f"Survey sent to {contact.full_name}",
        body=f"\u201c{template.name}\u201d sent to {contact.full_name} ({contact.email}).",
        code_company=contact.code_company,
        related_type="survey",
        related_id=survey.id,
    )

    return _survey_summary(survey)


def _survey_summary(s: Survey) -> dict:
    return {
        "id": s.id,
        "templateId": s.template_id,
        "templateName": s.template.name,
        "codeCompany": s.code_company,
        "contactId": s.contact_id,
        "contactName": s.contact.full_name if s.contact else None,
        "contactEmail": s.contact.email if s.contact else None,
        "token": str(s.token),
        "status": s.status,
        "sentAt": s.sent_at.isoformat() if s.sent_at else None,
        "completedAt": s.completed_at.isoformat() if s.completed_at else None,
        "expiresAt": s.expires_at.isoformat() if s.expires_at else None,
    }


# ── Public survey (unauthenticated — the client's side) ────────────────

def get_public_survey(token: str) -> dict | None:
    """Looks up a survey by its public token. Returns None if the token is
    invalid or unknown, so the view can turn that into a 404."""
    try:
        survey = Survey.objects.select_related("template").get(token=token)
    except (Survey.DoesNotExist, ValueError, ValidationError):
        return None

    if survey.status == SurveyStatus.COMPLETED:
        return {**_public_shell(survey), "alreadyCompleted": True}

    if survey.expires_at and timezone.now() > survey.expires_at:
        if survey.status != SurveyStatus.EXPIRED:
            survey.status = SurveyStatus.EXPIRED
            survey.save(update_fields=["status"])
        return {**_public_shell(survey), "expired": True}

    # NOTE (known, deferred): this fetches the template's questions LIVE at
    # fill-time rather than a snapshot from when the survey was sent. If the
    # template is edited between send and fill, the client sees different
    # questions than what the email implied. Not fixed yet — flagged here on
    # purpose so it isn't forgotten before templates are edited for real.
    questions = survey.template.questions.filter(is_active=True).order_by("order")
    return {
        **_public_shell(survey),
        "questions": [
            {
                "id": q.id,
                "order": q.order,
                "text": q.text,
                "questionType": q.question_type,
                "options": q.options,
                "isRequired": q.is_required,
                "dependsOnQuestion": q.depends_on_question_id,
                "showIfMinValue": q.show_if_min_value,
                "excludesSelectedFrom": q.excludes_selected_from_id,
            }
            for q in questions
        ],
    }


def _public_shell(s: Survey) -> dict:
    """What the client-facing page needs. Company name is fine to show here
    — only someone holding this specific unique token URL would ever see
    it, and it's their own company being referenced."""
    return {
        "templateName": s.template.name,
        "companyName": _get_company_name(s.code_company),
        "status": s.status,
    }


def submit_survey_responses(token: str, answers: list[dict]) -> dict:
    """
    answers: [{"question_id": 12, "value": 4}, ...]
    Raises ValueError for anything the client did wrong (already
    submitted, expired, missing required answers) — the view turns
    that into a 400 with the message shown directly on the public page.
    """
    try:
        survey = Survey.objects.select_related("template").get(token=token)
    except (Survey.DoesNotExist, ValueError, ValidationError):
        raise ValueError("Survey not found.")

    if survey.status == SurveyStatus.COMPLETED:
        raise ValueError("This survey has already been submitted.")

    if survey.expires_at and timezone.now() > survey.expires_at:
        survey.status = SurveyStatus.EXPIRED
        survey.save(update_fields=["status"])
        raise ValueError("This survey link has expired.")

    question_ids = set(survey.template.questions.filter(is_active=True).values_list("id", flat=True))
    all_questions = {q.id: q for q in survey.template.questions.filter(is_active=True)}
    answered_ids = set()

    for a in answers:
        qid = a.get("question_id")
        if qid not in question_ids:
            continue  # ignore anything not actually part of this template
        SurveyResponse.objects.update_or_create(
            survey=survey, question_id=qid,
            defaults={"answer_value": a.get("value")},
        )
        answered_ids.add(qid)

    # A required conditional question (depends_on_question) only counts as
    # "missing" if it was actually SHOWN to the client — i.e. the gating
    # question's answer met show_if_min_value. Otherwise the client never
    # saw it and shouldn't be blocked from submitting.
    answered_values = {a.get("question_id"): a.get("value") for a in answers}

    def _was_shown(q: SurveyQuestion) -> bool:
        if q.depends_on_question_id is None:
            return True
        gate_value = answered_values.get(q.depends_on_question_id)
        if gate_value is None or q.show_if_min_value is None:
            return False
        try:
            return float(gate_value) >= q.show_if_min_value
        except (TypeError, ValueError):
            return False

    missing_required = {
        q.id for q in all_questions.values()
        if q.is_required and q.id not in answered_ids and _was_shown(q)
    }
    if missing_required:
        raise ValueError(f"Please answer all required questions ({len(missing_required)} missing).")

    survey.status = SurveyStatus.COMPLETED
    survey.completed_at = timezone.now()
    survey.save(update_fields=["status", "completed_at"])

    notify(
        event_type=NotificationEventType.SURVEY_COMPLETED,
        title=f"{survey.contact.full_name if survey.contact else 'A client'} completed a survey",
        body=f"\u201c{survey.template.name}\u201d was just completed.",
        code_company=survey.code_company,
        related_type="survey",
        related_id=survey.id,
    )

    # ── Auto-trigger the AI verdict — best effort, never blocks submission.
    # If Groq/Mistral are both down or rate-limited, the client's page still
    # confirms successfully; the CS side just gets a "Run AI verdict" button
    # instead of a ready one on the fiche client, and can retry manually.
    try:
        verdict = generate_survey_verdict(survey.id)
        if verdict and verdict["status"] == VerdictStatus.READY:
            notify(
                event_type=NotificationEventType.VERDICT_READY,
                title=f"AI verdict ready — {survey.contact.full_name if survey.contact else 'client'}",
                body=f"Scoring for \u201c{survey.template.name}\u201d is ready to view.",
                code_company=survey.code_company,
                related_type="survey",
                related_id=survey.id,
            )
    except Exception as e:  # noqa: BLE001 — never let scoring break the client's submit
        logger.warning("Auto verdict generation failed for survey %s: %s", survey.id, e)

    return {"submitted": True}


# ── AI verdict / scoring engine ─────────────────────────────────────────

def _normalize_answer(question_type: str, value) -> float | None:
    """Maps a raw answer onto a common 0–100 scale so dimensions with
    mixed question types (rating_5, rating_10, nps, yes_no) can be
    averaged together. Returns None for types that aren't numerically
    scoreable (multiple_choice, open_text) or for unparsable values."""
    try:
        if question_type == "rating_5":
            v = float(value)
            return max(0.0, min(100.0, (v - 1) / 4 * 100))
        if question_type == "rating_10":
            v = float(value)
            return max(0.0, min(100.0, (v - 1) / 9 * 100))
        if question_type == "nps":
            v = float(value)
            return max(0.0, min(100.0, v / 10 * 100))
        if question_type == "yes_no":
            if isinstance(value, bool):
                return 100.0 if value else 0.0
            if isinstance(value, str):
                return 100.0 if value.strip().lower() in ("yes", "true", "1") else 0.0
    except (TypeError, ValueError):
        return None
    return None


def _compute_dimension_scores(qa_pairs: list[dict]) -> dict:
    """Weighted-average port of the Company Loyalty scoring pattern:
    each scoreable answer contributes normalized_value * weight to its
    tagged dimension. A dimension with no scoreable answers is None,
    not zero — mirrors the DAX BLANK() behaviour used elsewhere."""
    buckets: dict[str, list[tuple[float, float]]] = {"satisfaction": [], "loyalty": [], "upsell_readiness": []}
    for qa in qa_pairs:
        dim = qa["scoringDimension"]
        if dim not in buckets:
            continue
        norm = _normalize_answer(qa["questionType"], qa["answer"])
        if norm is None:
            continue
        buckets[dim].append((norm, qa["weight"]))

    scores = {}
    for dim, pairs in buckets.items():
        if not pairs:
            scores[dim] = None
            continue
        total_w = sum(w for _, w in pairs)
        scores[dim] = round(sum(v * w for v, w in pairs) / total_w, 1) if total_w else None

    present = [v for v in scores.values() if v is not None]
    overall = round(sum(present) / len(present), 1) if present else None
    return {
        "satisfaction": scores["satisfaction"],
        "loyalty": scores["loyalty"],
        "upsellReadiness": scores["upsell_readiness"],
        "overall": overall,
    }


_VERDICT_SYSTEM_PROMPT = (
    "You are a Customer Success analyst reviewing one completed client satisfaction "
    "survey. You are given the survey's questions (each tagged with a scoring "
    "dimension) and the client's raw answers, including any open-text feedback. "
    "Respond with STRICT JSON only — no markdown code fences, no preamble, no "
    "trailing text. Schema:\n"
    '{"sentiment": "positive|neutral|negative|mixed", '
    '"summary": "2-4 sentences in plain business language, grounded only in the '
    'answers given", '
    '"riskFlags": ["short strings — empty array if there is genuinely nothing to '
    'flag"], '
    '"recommendedActions": [{"label": "concrete, specific next step referencing '
    'what THIS client actually said — e.g. a relevant newsletter/content topic, a '
    'check-in call, an upsell conversation, a support follow-up", '
    '"category": "retention|upsell|content|outreach|support"}]}\n'
    "1-4 recommendedActions. Never invent facts not present in the answers."
)


def _build_verdict_prompt(survey: Survey, qa_pairs: list[dict]) -> list[dict]:
    lines = [
        f"Company code: {survey.code_company}",
        f"Survey template: {survey.template.name}",
        "",
        "Questions and answers:",
    ]
    for qa in qa_pairs:
        lines.append(f"- [{qa['scoringDimension']}] {qa['text']} => {qa['answer']!r}")
    return [
        {"role": "system", "content": _VERDICT_SYSTEM_PROMPT},
        {"role": "user", "content": "\n".join(lines)},
    ]


def _parse_verdict_json(raw: str) -> dict | list:
    """
    Tries progressively more forgiving parses before giving up — LLMs
    occasionally emit near-valid JSON: a literal newline inside a string
    instead of \\n (causes "Unterminated string"), or Python-repr-style
    single quotes instead of JSON double quotes. Each stage only runs if
    the previous one failed. Handles BOTH a top-level object ({...}) and
    a top-level array ([...]) — some callers expect a list of items, not
    a single object, and always assuming {...} would slice a list wrong.
    """
    text = (raw or "").strip()
    if text.startswith("```"):
        text = text.strip("`")
        if text[:4].lower() == "json":
            text = text[4:]
    text = text.strip()

    # Extract the outermost JSON structure — object or array, whichever
    # bracket actually comes first in the text — instead of always
    # assuming {...}.
    brace_start, brace_end = text.find("{"), text.rfind("}")
    bracket_start, bracket_end = text.find("["), text.rfind("]")
    candidates = []
    if brace_start != -1 and brace_end != -1 and brace_end > brace_start:
        candidates.append((brace_start, text[brace_start:brace_end + 1]))
    if bracket_start != -1 and bracket_end != -1 and bracket_end > bracket_start:
        candidates.append((bracket_start, text[bracket_start:bracket_end + 1]))
    if candidates:
        candidates.sort(key=lambda c: c[0])  # whichever bracket appears first is the real wrapper
        text = candidates[0][1]

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    try:
        # strict=False tolerates raw control characters (literal newlines/
        # tabs) inside string values, which json.loads rejects by default.
        return json.loads(text, strict=False)
    except json.JSONDecodeError:
        pass

    # Escape any bare newlines/tabs that aren't already escaped — a
    # frequent cause of "Unterminated string" when the model writes
    # multi-line text without escaping the line breaks.
    repaired = re.sub(r"(?<!\\)\n", "\\\\n", text)
    repaired = re.sub(r"(?<!\\)\t", "\\\\t", repaired)
    try:
        return json.loads(repaired, strict=False)
    except json.JSONDecodeError:
        pass

    # Last resort: the model used Python-repr-style single quotes instead
    # of JSON double quotes (e.g. {'text': 'value'}). Blindly swapping
    # every ' for " is unsafe if a string value legitimately contains an
    # apostrophe, but it's a reasonable final attempt before giving up.
    return json.loads(repaired.replace("'", '"'), strict=False)


_NEXT_STEPS_SYSTEM_PROMPT = (
    "You are a Customer Success strategist writing an internal next-steps report "
    "for the account team, based on one client's completed satisfaction survey. "
    "You have the client's raw answers and the computed satisfaction/loyalty/upsell "
    "scores. Write a clear report (4-6 short paragraphs, plain text, no markdown "
    "headers) covering: (1) an overall assessment of the relationship's health right "
    "now, grounded in the actual scores and answers; (2) specific risks or watch-items "
    "if any, or a note that none are apparent; (3) concrete next steps the account "
    "team should take, each tied to what this client actually said, with a rough "
    "sense of priority/timing (e.g. this week, this quarter); (4) who should likely "
    "own each step (account manager, support, sales) where relevant. Never invent "
    "facts not present in the data. Write for a busy manager skimming the report."
)


def _generate_next_steps_report(survey: Survey, scores: dict, sentiment: str, summary: str, qa_pairs: list[dict]) -> str:
    """Second, SEPARATE LLM call for the longer narrative report — distinct from
    the short structured verdict fields, so a parsing failure in one never
    affects the other. Returns "" (never raises) if generation fails; the
    short verdict still stands on its own either way."""
    try:
        from Gen_BI.services.llm_client import chat as llm_chat
        lines = [
            f"Company: {survey.code_company}",
            f"Survey: {survey.template.name}",
            f"Computed scores — overall: {scores['overall']}, satisfaction: {scores['satisfaction']}, "
            f"loyalty: {scores['loyalty']}, upsell readiness: {scores['upsellReadiness']}",
            f"Sentiment: {sentiment}",
            f"Short summary already generated: {summary}",
            "",
            "Full Q&A:",
        ]
        for qa in qa_pairs:
            lines.append(f"- [{qa['scoringDimension']}] {qa['text']} => {qa['answer']!r}")
        prompt = [
            {"role": "system", "content": _NEXT_STEPS_SYSTEM_PROMPT},
            {"role": "user", "content": "\n".join(lines)},
        ]
        return (llm_chat(prompt, max_tokens=700, temperature=0.3) or "").strip()
    except Exception as e:  # noqa: BLE001 — best-effort, never blocks the short verdict
        logger.warning("Next-steps report generation failed for survey %s: %s", survey.id, e)
        return ""


_LOGO_PATH = os.getenv(
    "MEDIANET_LOGO_PATH",
    os.path.join(os.path.dirname(__file__), "assets", "logo-medianet.png"),
)

_UNICODE_ASCII_MAP = {
    "\u2013": "-", "\u2014": "-",     # en dash, em dash
    "\u2010": "-", "\u2011": "-",     # hyphen, non-breaking hyphen
    "\u2212": "-",                     # minus sign
    "\u2018": "'", "\u2019": "'",     # smart single quotes
    "\u201c": '"', "\u201d": '"',     # smart double quotes
    "\u2026": "...",                   # ellipsis
    "\u2022": "-",                     # bullet, if it slips into body text
}


def _sanitize_for_pdf(text: str) -> str:
    """reportlab's default Helvetica font doesn't cover every Unicode
    glyph — smart quotes, en/em dashes, and ellipses the LLM tends to use
    render as a black replacement box otherwise. ASCII-normalize them."""
    if not text:
        return text
    for bad, good in _UNICODE_ASCII_MAP.items():
        text = text.replace(bad, good)
    return text


def _markdown_light_to_reportlab(text: str) -> str:
    """Converts the light markdown the LLM sometimes uses (**bold**)
    despite being told not to, into reportlab's supported inline markup,
    and escapes stray angle brackets so they aren't misread as tags."""
    text = _sanitize_for_pdf(text)
    text = text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    text = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", text)
    return text


def _logo_flowable(max_width):
    """Returns a reportlab Image flowable for the MEDIANET logo, sized to
    max_width with aspect ratio preserved, or None if the file isn't
    present — the report still renders fine without it."""
    if not os.path.exists(_LOGO_PATH):
        return None
    try:
        from PIL import Image as PILImage
        from reportlab.platypus import Image as RLImage
        with PILImage.open(_LOGO_PATH) as img:
            w, h = img.size
        return RLImage(_LOGO_PATH, width=max_width, height=max_width * (h / w))
    except Exception as e:  # noqa: BLE001 — never let a bad logo file break the report
        logger.warning("Failed to load MEDIANET logo for report: %s", e)
        return None


def _render_report_html(survey: Survey, verdict: SurveyVerdict) -> str:
    """
    Condensed SUMMARY for the email body — NOT a copy of the full report.
    Just enough to know the health of the account and the top actions at a
    glance; the PDF attachment is the actual report. No inline logo image
    here (that needs a CID attachment wired up in the sending function,
    which is deliberately left untouched) — a styled text wordmark instead.
    """
    company_name = _get_company_name(survey.code_company)

    def fmt(score):
        return f"{score:.0f}/100" if score is not None else "—"

    top_actions = verdict.recommended_actions[:3]
    actions_html = "".join(
        f"<li>{(a.get('label', '') if isinstance(a, dict) else str(a))}</li>" for a in top_actions
    ) or "<li>None flagged this round.</li>"

    return f"""
    <div style="font-family: Arial, sans-serif; color: #182860; max-width: 600px;">
      <p style="font-size:13px; font-weight:bold; letter-spacing:1px; color:#F5A623; text-transform:uppercase; margin-bottom:14px;">
        MEDIA<span style="color:#00AADD;">NET</span>
      </p>
      <h2 style="margin-top:0; margin-bottom:2px;">Next Steps Report</h2>
      <p style="color:#555; margin-top:0;">{company_name} · {survey.template.name}</p>

      <table style="border-collapse:collapse; margin:16px 0;">
        <tr style="background:#182860; color:white;">
          <th style="padding:8px 14px;">Overall</th>
          <th style="padding:8px 14px;">Satisfaction</th>
          <th style="padding:8px 14px;">Loyalty</th>
          <th style="padding:8px 14px;">Upsell</th>
        </tr>
        <tr>
          <td style="padding:8px 14px; text-align:center; border:1px solid #ddd;">{fmt(verdict.overall_score)}</td>
          <td style="padding:8px 14px; text-align:center; border:1px solid #ddd;">{fmt(verdict.satisfaction_score)}</td>
          <td style="padding:8px 14px; text-align:center; border:1px solid #ddd;">{fmt(verdict.loyalty_score)}</td>
          <td style="padding:8px 14px; text-align:center; border:1px solid #ddd;">{fmt(verdict.upsell_readiness_score)}</td>
        </tr>
      </table>
      <p style="font-size:11px; color:#888; margin-top:-8px;">Scores are out of 100.</p>

      <p><strong>Sentiment:</strong> {verdict.sentiment.capitalize() if verdict.sentiment else '—'}</p>
      <p>{verdict.summary}</p>

      <h3 style="margin-bottom:6px;">Top next steps</h3>
      <ul style="margin-top:0;">{actions_html}</ul>

      <p style="color:#888; font-size:11px; margin-top:24px; padding-top:14px; border-top:1px solid #eee;">
        Full analysis, risk flags, and the complete action plan are in the attached PDF.
      </p>
    </div>
    """


def _render_report_pdf(survey: Survey, verdict: SurveyVerdict) -> bytes:
    """Requires reportlab (pip install reportlab) — pure Python, no system
    dependencies, unlike WeasyPrint (which needs Pango/Cairo and is painful
    to install on Windows)."""
    from io import BytesIO
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import letter
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import inch
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle

    company_name = _get_company_name(survey.code_company)

    # MEDIANET brand palette
    NAVY, ORANGE, CYAN, CORAL = "#182860", "#F5A623", "#00AADD", "#EA564B"
    SENTIMENT_COLOR = {"positive": CYAN, "neutral": "#5D97EB", "mixed": ORANGE, "negative": CORAL}

    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=letter, topMargin=0.6 * inch, bottomMargin=0.75 * inch)
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle("TitleCustom", parent=styles["Title"], fontSize=20, textColor=colors.HexColor(NAVY), spaceAfter=2)
    label_style = ParagraphStyle("Label", parent=styles["Normal"], fontSize=10, textColor=colors.HexColor("#666666"), spaceAfter=14)
    heading_style = ParagraphStyle("Heading", parent=styles["Heading2"], fontSize=13, textColor=colors.HexColor(NAVY), spaceBefore=16, spaceAfter=6)
    body_style = ParagraphStyle("Body", parent=styles["Normal"], fontSize=10.5, leading=16)
    caption_style = ParagraphStyle("Caption", parent=styles["Normal"], fontSize=8, textColor=colors.HexColor("#999999"))

    story = []
    logo = _logo_flowable(max_width=1.6 * inch)
    if logo:
        story.append(logo)
        story.append(Spacer(1, 0.1 * inch))

    story.append(Paragraph("Next Steps Report", title_style))
    story.append(Paragraph(f"{company_name} · {survey.template.name}", label_style))

    def fmt(score):
        return f"{score:.0f}/100" if score is not None else "—"

    score_table = Table(
        [
            ["Overall", "Satisfaction", "Loyalty", "Upsell Readiness"],
            [fmt(verdict.overall_score), fmt(verdict.satisfaction_score),
             fmt(verdict.loyalty_score), fmt(verdict.upsell_readiness_score)],
        ],
        colWidths=[1.5 * inch] * 4,
    )
    score_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor(NAVY)),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("BOTTOMPADDING", (0, 0), (-1, 0), 7),
        ("TOPPADDING", (0, 0), (-1, 0), 7),
        ("BOTTOMPADDING", (0, 1), (-1, 1), 8),
        ("TOPPADDING", (0, 1), (-1, 1), 8),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#dddddd")),
    ]))
    story += [score_table, Paragraph("Scores are out of 100.", caption_style), Spacer(1, 0.15 * inch)]

    if verdict.sentiment:
        sentiment_color = SENTIMENT_COLOR.get(verdict.sentiment, NAVY)
        story.append(Paragraph(
            f'<font color="{sentiment_color}"><b>Sentiment: {verdict.sentiment.capitalize()}</b></font>',
            body_style,
        ))
        story.append(Spacer(1, 0.08 * inch))
    if verdict.summary:
        story += [Paragraph("Summary", heading_style), Paragraph(_sanitize_for_pdf(verdict.summary), body_style)]
    if verdict.risk_flags:
        story.append(Paragraph("Risk Flags", heading_style))
        story += [Paragraph(f"• {_sanitize_for_pdf(flag)}", body_style) for flag in verdict.risk_flags]
    if verdict.recommended_actions:
        story.append(Paragraph("Recommended Actions", heading_style))
        for a in verdict.recommended_actions:
            label = _sanitize_for_pdf(a.get("label", "") if isinstance(a, dict) else str(a))
            category = a.get("category", "") if isinstance(a, dict) else ""
            prefix = f'<font color="{ORANGE}"><b>[{category}]</b></font> ' if category else ""
            story.append(Paragraph(f"• {prefix}{label}", body_style))
    if verdict.next_steps_report:
        story.append(Paragraph("Next Steps", heading_style))
        for para in verdict.next_steps_report.split("\n\n"):
            para = para.strip()
            if para:
                formatted = _markdown_light_to_reportlab(para).replace("\n", "<br/>")
                story.append(Paragraph(formatted, body_style))
                story.append(Spacer(1, 0.08 * inch))

    doc.build(story)
    return buffer.getvalue()


def _email_next_steps_report(survey: Survey, verdict: SurveyVerdict, recipient_email: str | None = None) -> None:
    """
    Best-effort, never raises — but DOES log clearly when it can't send, so
    a silent no-op (e.g. no recipient available) is visible in the Django
    console instead of just... nothing happening. Recipient priority:
      1. recipient_email explicitly passed (manual re-run — whoever's
         currently logged in on the frontend, which is the only place
         that actually knows, since Django has no auth of its own)
      2. survey.sent_by_email (whoever sent it originally — used for the
         automatic trigger right after the client submits, where nobody
         is "logged in" at all)
      3. REPORT_RECIPIENT_EMAILS env var (final safety net)

    Sends an HTML email (with a plain-text fallback for non-HTML clients)
    with the full report attached as a PDF.
    """
    recipients = [recipient_email] if recipient_email else []
    if not recipients and survey.sent_by_email:
        recipients = [survey.sent_by_email]
    if not recipients:
        recipients = [e.strip() for e in os.getenv("REPORT_RECIPIENT_EMAILS", "").split(",") if e.strip()]

    if not recipients:
        logger.warning(
            "No recipient available for survey %s's next-steps report — "
            "no recipient_email passed, no sent_by_email on the survey, and "
            "REPORT_RECIPIENT_EMAILS is unset. Report was NOT emailed.",
            survey.id,
        )
        verdict.report_send_error = "No recipient available (no logged-in user, no sender on record, no fallback configured)."
        verdict.save(update_fields=["report_send_error"])
        return
    if not verdict.next_steps_report:
        logger.warning("Survey %s has recipients but no next_steps_report text — nothing to email.", survey.id)
        verdict.report_send_error = "No next-steps report text was generated to send."
        verdict.save(update_fields=["report_send_error"])
        return

    try:
        from django.core.mail import EmailMultiAlternatives

        contact_name = survey.contact.full_name if survey.contact else "a client"
        company_name = _get_company_name(survey.code_company)
        subject = f"Next Steps Report — {survey.template.name}"
        plain_body = (
            f"Next steps report for {contact_name} ({survey.code_company})\n"
            f"Survey: {survey.template.name}\n"
            f"Overall score: {verdict.overall_score} · Sentiment: {verdict.sentiment}\n\n"
            f"{verdict.next_steps_report}\n"
            f"\n(This email supports HTML with a PDF attached — if you're seeing only this "
            f"plain-text version, your email client didn't render the HTML version.)"
        )
        html_body = _render_report_html(survey, verdict)
        pdf_bytes = _render_report_pdf(survey, verdict)

        email = EmailMultiAlternatives(subject, plain_body, settings.DEFAULT_FROM_EMAIL, recipients)
        email.attach_alternative(html_body, "text/html")
        safe_name = re.sub(r"[^A-Za-z0-9]+", "_", company_name).strip("_") or survey.code_company
        pdf_filename = f"Next_Steps_Report_{safe_name}_{timezone.now():%Y-%m-%d}.pdf"
        email.attach(pdf_filename, pdf_bytes, "application/pdf")
        email.send(fail_silently=False)

        verdict.report_sent_at = timezone.now()
        verdict.report_send_error = ""
        verdict.save(update_fields=["report_sent_at", "report_send_error"])
    except Exception as e:  # noqa: BLE001 — best-effort, never blocks verdict generation
        logger.warning("Failed to email next-steps report for survey %s: %s", survey.id, e)
        verdict.report_send_error = str(e)
        verdict.save(update_fields=["report_send_error"])


def generate_survey_verdict(survey_id: int, recipient_email: str | None = None) -> dict | None:
    """
    (Re)runs the AI verdict/scoring engine for one completed survey and
    persists it to SurveyVerdict (upsert — one row per survey, latest
    run wins). Returns the verdict summary dict, or None if the survey
    doesn't exist. Raises ValueError if the survey isn't completed yet
    (nothing to score).

    recipient_email: pass the current frontend user's email on a manual
    re-run so the report goes to them specifically; leave None for the
    automatic post-submission trigger, where it falls back to
    survey.sent_by_email (see _email_next_steps_report).
    """
    try:
        survey = Survey.objects.select_related("template", "contact").get(id=survey_id)
    except Survey.DoesNotExist:
        return None

    if survey.status != SurveyStatus.COMPLETED:
        raise ValueError("Can only generate a verdict for a completed survey.")

    responses = SurveyResponse.objects.filter(survey=survey).select_related("question")
    qa_pairs = [
        {
            "text": r.question.text,
            "questionType": r.question.question_type,
            "scoringDimension": r.question.scoring_dimension,
            "weight": r.question.weight,
            "answer": r.answer_value,
        }
        for r in responses
    ]

    verdict, _ = SurveyVerdict.objects.get_or_create(survey=survey)
    scores = _compute_dimension_scores(qa_pairs)
    verdict.satisfaction_score = scores["satisfaction"]
    verdict.loyalty_score = scores["loyalty"]
    verdict.upsell_readiness_score = scores["upsellReadiness"]
    verdict.overall_score = scores["overall"]

    parsed = None
    last_error: Exception | None = None
    for attempt in range(2):  # one retry — malformed JSON is usually transient, not systematic
        try:
            from Gen_BI.services.llm_client import chat as llm_chat  # reuse the Groq -> Mistral chain
            raw = llm_chat(_build_verdict_prompt(survey, qa_pairs), max_tokens=800, temperature=0.2)
            parsed = _parse_verdict_json(raw)
            break
        except Exception as e:  # noqa: BLE001 — provider down, bad JSON, etc.
            last_error = e
            logger.warning("Verdict generation attempt %s failed for survey %s: %s", attempt + 1, survey_id, e)

    if parsed is None:
        verdict.status = VerdictStatus.FAILED
        verdict.error_message = str(last_error)
        verdict.save()
        return _verdict_summary(verdict)

    verdict.status = VerdictStatus.READY
    verdict.sentiment = parsed.get("sentiment", "") or ""
    verdict.summary = parsed.get("summary", "") or ""
    verdict.risk_flags = parsed.get("riskFlags", []) or []
    verdict.recommended_actions = parsed.get("recommendedActions", []) or []
    verdict.next_steps_report = _generate_next_steps_report(survey, scores, verdict.sentiment, verdict.summary, qa_pairs)
    verdict.model_used = "groq/mistral chain"
    verdict.error_message = ""
    verdict.generation_count = verdict.generation_count + 1
    verdict.generated_at = timezone.now()
    verdict.save()

    _email_next_steps_report(survey, verdict, recipient_email)

    return _verdict_summary(verdict)


def _verdict_summary(v: SurveyVerdict) -> dict:
    return {
        "surveyId": v.survey_id,
        "status": v.status,
        "overallScore": v.overall_score,
        "satisfactionScore": v.satisfaction_score,
        "loyaltyScore": v.loyalty_score,
        "upsellReadinessScore": v.upsell_readiness_score,
        "sentiment": v.sentiment,
        "summary": v.summary,
        "riskFlags": v.risk_flags,
        "recommendedActions": v.recommended_actions,
        "nextStepsReport": v.next_steps_report,
        "modelUsed": v.model_used,
        "errorMessage": v.error_message,
        "generationCount": v.generation_count,
        "generatedAt": v.generated_at.isoformat() if v.generated_at else None,
        "reportSentAt": v.report_sent_at.isoformat() if v.report_sent_at else None,
        "reportSendError": v.report_send_error,
    }


# ── Company-level survey views (fiche client) ───────────────────────────

def list_surveys_for_company(code_company: str) -> list[dict]:
    """All surveys ever sent to this company (any contact), newest first,
    each carrying its verdict summary if one exists yet."""
    qs = (
        Survey.objects.filter(code_company=code_company)
        .select_related("template", "contact")
        .order_by("-created_at")
    )
    return [_survey_with_verdict(s) for s in qs]


def get_survey_full_detail(survey_id: int) -> dict | None:
    """Full detail for one survey: summary + verdict + every Q&A pair,
    for the expanded 'view results' panel."""
    try:
        survey = Survey.objects.select_related("template", "contact").get(id=survey_id)
    except Survey.DoesNotExist:
        return None

    responses = (
        SurveyResponse.objects.filter(survey=survey)
        .select_related("question")
        .order_by("question__order")
    )
    data = _survey_with_verdict(survey)
    data["responses"] = [
        {
            "questionId": r.question_id,
            "text": r.question.text,
            "questionType": r.question.question_type,
            "scoringDimension": r.question.scoring_dimension,
            "weight": r.question.weight,
            "answer": r.answer_value,
            "answeredAt": r.answered_at.isoformat(),
        }
        for r in responses
    ]
    return data


def delete_survey(survey_id: int) -> bool:
    """
    Hard delete — unlike delete_question/delete_contact, there's no
    deactivate-instead fallback here. SurveyResponse and SurveyVerdict are
    both CASCADE off Survey, so removing a Survey cleanly removes its full
    response history and verdict too, and nothing else references Survey
    via PROTECT. Used both for manual per-survey deletion from the Client
    Feedback page and by the quarterly cleanup_old_surveys command.
    Returns True if a row was actually deleted, False if it didn't exist.
    """
    deleted, _ = Survey.objects.filter(id=survey_id).delete()
    return deleted > 0


def get_survey_report_pdf(survey_id: int) -> tuple[str, bytes] | None:
    """
    Regenerates the next-steps PDF on demand from the stored survey +
    verdict — the exact same renderer _email_next_steps_report uses, so
    what you download always matches what was (or would have been)
    emailed, without needing to persist the file anywhere. Returns None
    if the survey doesn't exist or doesn't have a ready verdict yet.
    """
    try:
        survey = Survey.objects.select_related("template", "contact").get(id=survey_id)
        verdict = survey.verdict
    except (Survey.DoesNotExist, SurveyVerdict.DoesNotExist):
        return None
    if verdict.status != VerdictStatus.READY:
        return None

    company_name = _get_company_name(survey.code_company)
    safe_name = re.sub(r"[^A-Za-z0-9]+", "_", company_name).strip("_") or survey.code_company
    filename = f"Next_Steps_Report_{safe_name}_{timezone.now():%Y-%m-%d}.pdf"
    return filename, _render_report_pdf(survey, verdict)


def _survey_with_verdict(s: Survey) -> dict:
    data = _survey_summary(s)
    try:
        data["verdict"] = _verdict_summary(s.verdict)
    except SurveyVerdict.DoesNotExist:
        data["verdict"] = None
    return data


# ── Client Feedback (global page — every company, not one fiche) ───────

def _get_company_names(code_companies: list[str]) -> dict[str, str]:
    """Batch warehouse lookup — one query for every company name needed,
    instead of one query per row."""
    if not code_companies:
        return {}
    conn = get_warehouse_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                'SELECT code_company::text AS code, "company" AS name '
                'FROM public."Dim_Company" WHERE code_company::text = ANY(%s);',
                [[str(c) for c in code_companies]],
            )
            return {r["code"]: r["name"] for r in cur.fetchall()}
    finally:
        release_warehouse_conn(conn)


def list_companies_with_activity() -> list[dict]:
    """
    Every company that has at least one active contact or one sent survey —
    powers the global 'Client Feedback' page (contacts + full survey/AI
    verdict history across ALL clients, separate from the single-company
    view embedded in a fiche client).
    """
    from django.db.models import Count

    contact_counts = dict(
        ClientContact.objects.filter(is_active=True)
        .values("code_company").annotate(n=Count("id"))
        .values_list("code_company", "n")
    )
    survey_counts = dict(
        Survey.objects.values("code_company").annotate(n=Count("id"))
        .values_list("code_company", "n")
    )
    all_codes = set(contact_counts) | set(survey_counts)
    if not all_codes:
        return []

    names = _get_company_names(list(all_codes))

    # One query for every company's surveys, newest first per company —
    # avoids an N+1 query per row for "latest survey".
    latest_by_company: dict[str, Survey] = {}
    for s in (
            Survey.objects.filter(code_company__in=all_codes)
                    .select_related("template", "contact")
                    .order_by("code_company", "-created_at")
    ):
        latest_by_company.setdefault(s.code_company, s)

    results = []
    for code in all_codes:
        latest = latest_by_company.get(code)
        results.append({
            "codeCompany": code,
            "companyName": names.get(str(code), code),
            "contactCount": contact_counts.get(code, 0),
            "surveyCount": survey_counts.get(code, 0),
            "latestSurvey": _survey_with_verdict(latest) if latest else None,
        })

    # Most recent survey activity first; companies with only contacts and
    # no surveys yet sink to the bottom rather than sorting arbitrarily.
    results.sort(
        key=lambda r: (r["latestSurvey"] or {}).get("sentAt") or "",
        reverse=True,
    )
    return results


# ── Notifications (CRM alerts — topbar bell) ────────────────────────────

def list_notifications(unread_only: bool = False, limit: int = 20) -> dict:
    qs = Notification.objects.all()
    if unread_only:
        qs = qs.filter(is_read=False)
    items = list(qs[:limit])
    unread_count = Notification.objects.filter(is_read=False).count()
    return {
        "items": [_notification_summary(n) for n in items],
        "unreadCount": unread_count,
    }


def _notification_summary(n: Notification) -> dict:
    return {
        "id": n.id,
        "eventType": n.event_type,
        "title": n.title,
        "body": n.body,
        "codeCompany": n.code_company,
        "relatedType": n.related_type,
        "relatedId": n.related_id,
        "isRead": n.is_read,
        "createdAt": n.created_at.isoformat(),
    }


def notify(
        event_type: str,
        title: str,
        body: str = "",
        code_company: str = "",
        related_type: str = "",
        related_id: str = "",
) -> None:
    """
    Public entrypoint for OTHER apps (deals, projects) to raise a CRM
    notification without importing the Notification model directly.
    Deliberately dumb — just a row insert — so it's a single, easy place
    to extend later (push, webhook, email digest) without touching every
    call site across the codebase.

    Usage from deals/services.py or projects/services.py:
        from surveys.services import notify
        notify(event_type="deal_won", title="...", body="...",
               related_type="deal", related_id=opportunity_id)
    """
    Notification.objects.create(
        event_type=event_type,
        title=title,
        body=body,
        code_company=code_company,
        related_type=related_type,
        related_id=str(related_id),
    )


def mark_notification_read(notification_id: int) -> bool:
    updated = Notification.objects.filter(id=notification_id).update(is_read=True)
    return updated > 0


def mark_all_notifications_read() -> int:
    return Notification.objects.filter(is_read=False).update(is_read=True)


def delete_notification(notification_id: int) -> bool:
    deleted, _ = Notification.objects.filter(id=notification_id).delete()
    return deleted > 0


def delete_all_notifications() -> int:
    deleted, _ = Notification.objects.all().delete()
    return deleted


# ── Survey cleanup audit trail ───────────────────────────────────────────

def list_cleanup_runs(limit: int = 50) -> list[dict]:
    """GET-friendly history of cleanup_old_surveys executions — real
    deletes and --dry-run checks alike — for the Client Feedback page's
    audit panel. Newest first (SurveyCleanupRun.Meta.ordering)."""
    runs = SurveyCleanupRun.objects.all()[:limit]
    return [
        {
            "id": r.id,
            "ranAt": r.ran_at.isoformat(),
            "cutoffDays": r.cutoff_days,
            "wasDryRun": r.was_dry_run,
            "deletedCount": r.deleted_count,
            "details": r.details,
        }
        for r in runs
    ]