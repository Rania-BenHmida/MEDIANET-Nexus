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

from db import get_warehouse_conn, release_warehouse_conn
from django.conf import settings
from django.core.mail import send_mail
from django.core.exceptions import ValidationError
from django.utils import timezone
import datetime
from .models import (
    SurveyTemplate, SurveyQuestion, ClientContact, Industry, ServiceCategory,
    Survey, SurveyResponse, SurveyStatus, Notification, NotificationEventType,
    SurveyVerdict, VerdictStatus,
)

logger = logging.getLogger("surveys")


# ── Template CRUD ────────────────────────────────────────────────────────

def list_templates(industry: str | None = None, service_category: str | None = None, active_only: bool = True) -> list[dict]:
    qs = SurveyTemplate.objects.all()
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


_INDUSTRY_KEYWORD_MAP = {
    Industry.BANKING_FINANCE: ["bank", "finance", "insurance", "audit"],
    Industry.CONSULTING: ["consult", "advisory"],
    Industry.AGRO_FOOD: ["agro", "food", "dairy", "beverage"],
    Industry.EDUCATION: ["education", "research", "university", "school"],
    Industry.TELECOM: ["telecom", "communication"],
    Industry.RETAIL: ["retail", "distribution", "commerce"],
}


def _map_dw_industry_to_choice(dw_industry: str | None) -> str:
    """DW's Industry column is free text; map it onto our fixed choices with a light keyword match."""
    if not dw_industry:
        return Industry.OTHER
    low = dw_industry.lower()
    for choice, keywords in _INDUSTRY_KEYWORD_MAP.items():
        if any(k in low for k in keywords):
            return choice
    return Industry.OTHER


def resolve_template_for_company(code_company: str, service_category: str | None = None) -> dict | None:
    """
    The "smart" part: given a company, find its DW industry, map it onto
    our template industries, and pick the best active match — same
    industry + service_category first, then same industry only, then
    the generic is_default template.
    """
    dw_industry = _get_company_industry(code_company)
    mapped_industry = _map_dw_industry_to_choice(dw_industry)

    qs = SurveyTemplate.objects.filter(is_active=True)

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

def create_and_send_survey(template_id: int, contact_id: int, expires_in_days: int = 14) -> dict:
    """
    Creates a Survey instance (a real row, with a unique token) and
    emails the contact a link to fill it. Raises ValueError on anything
    the caller did wrong (bad ids, inactive records) so the view can
    turn that into a clean 400 instead of a 500.
    """
    try:
        template = SurveyTemplate.objects.get(id=template_id, is_active=True)
    except SurveyTemplate.DoesNotExist:
        raise ValueError("Template not found or inactive.")
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
        expires_at=timezone.now() + datetime.timedelta(days=expires_in_days),
    )

    link = f"{settings.FRONTEND_URL}/survey/{survey.token}"
    subject = f"MEDIANET — {template.name}"
    body = (
        f"Hi {contact.full_name},\n\n"
        f"We'd love your feedback on our work together. It only takes a couple of "
        f"minutes — please use the link below:\n\n"
        f"{link}\n\n"
        f"This link expires in {expires_in_days} days.\n\n"
        f"Thank you,\nMEDIANET Customer Success"
    )
    send_mail(subject, body, settings.DEFAULT_FROM_EMAIL, [contact.email], fail_silently=False)

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
            }
            for q in questions
        ],
    }


def _public_shell(s: Survey) -> dict:
    """Only what the client-facing page needs — no internal ids, no company name."""
    return {"templateName": s.template.name, "status": s.status}


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
    required_ids = set(survey.template.questions.filter(is_active=True, is_required=True).values_list("id", flat=True))
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

    missing_required = required_ids - answered_ids
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


def _parse_verdict_json(raw: str) -> dict:
    text = (raw or "").strip()
    if text.startswith("```"):
        text = text.strip("`")
        if text[:4].lower() == "json":
            text = text[4:]
    text = text.strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        start, end = text.find("{"), text.rfind("}")
        if start != -1 and end != -1 and end > start:
            return json.loads(text[start:end + 1])
        raise


def generate_survey_verdict(survey_id: int) -> dict | None:
    """
    (Re)runs the AI verdict/scoring engine for one completed survey and
    persists it to SurveyVerdict (upsert — one row per survey, latest
    run wins). Returns the verdict summary dict, or None if the survey
    doesn't exist. Raises ValueError if the survey isn't completed yet
    (nothing to score).
    """
    try:
        survey = Survey.objects.select_related("template").get(id=survey_id)
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

    try:
        from Gen_BI.services.llm_client import chat as llm_chat  # reuse the Groq -> Mistral chain
        raw = llm_chat(_build_verdict_prompt(survey, qa_pairs), max_tokens=500, temperature=0.2)
        parsed = _parse_verdict_json(raw)
    except Exception as e:  # noqa: BLE001 — provider down, bad JSON, etc.
        verdict.status = VerdictStatus.FAILED
        verdict.error_message = str(e)
        verdict.save()
        return _verdict_summary(verdict)

    verdict.status = VerdictStatus.READY
    verdict.sentiment = parsed.get("sentiment", "") or ""
    verdict.summary = parsed.get("summary", "") or ""
    verdict.risk_flags = parsed.get("riskFlags", []) or []
    verdict.recommended_actions = parsed.get("recommendedActions", []) or []
    verdict.model_used = "groq/mistral chain"
    verdict.error_message = ""
    verdict.generation_count = verdict.generation_count + 1
    verdict.generated_at = timezone.now()
    verdict.save()

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
        "modelUsed": v.model_used,
        "errorMessage": v.error_message,
        "generationCount": v.generation_count,
        "generatedAt": v.generated_at.isoformat() if v.generated_at else None,
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