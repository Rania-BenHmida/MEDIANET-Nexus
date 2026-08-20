"""
surveys/models.py

First real Django-managed data layer in NEXUS. Everything else in the
platform (customers, deals, projects) reads the Talend-owned warehouse
via raw SQL through db.py and never writes to it. This app is the
exception on purpose: survey templates, questions, and client contacts
are operational data that belongs to the platform itself, not to the
BI warehouse, so they live as normal Django models with normal
migrations.

Tables land in the same Postgres database as the warehouse (see
settings.DATABASES), but Django prefixes every table with the app
label ("surveys_..."), so there's no collision with the quoted
PascalCase DW tables ("Dim_Company", "Fact_Subscription", ...).
"""

from django.db import models
import uuid


class Industry(models.TextChoices):
    """
    Matches the DW's real Dim_Company.Industry values exactly (curated to
    the industries with real client data right now — expand this list as
    more industries get dedicated question sets). OTHER is the fallback
    for any company whose industry isn't in this curated set yet.
    """
    MANUFACTURING = "manufacturing", "Manufacturing"
    SERVICES = "services", "Services"
    TOURISM = "tourism", "Tourism"
    FOOD_BEVERAGE = "food_beverage", "Food & Beverage"
    NGO_DEVELOPMENT = "ngo_development", "NGO & Development Organization"
    BANKING = "banking", "Banking"
    EDUCATION = "education", "Education"
    ADVERTISING_MARKETING = "advertising_marketing", "Advertising & Marketing"
    STAFFING_RECRUITMENT = "staffing_recruitment", "Staffing & Recruitment"
    TELECOM = "telecom", "Telecom"
    POSTAL_SERVICES = "postal_services", "Postal Services"
    OTHER = "other", "Other / Generic"


class ServiceCategory(models.TextChoices):
    WEB_DEV = "web_dev", "Web Development"
    DIGITAL_MARKETING = "digital_marketing", "Digital Marketing"
    HOSTING_MAINTENANCE = "hosting_maintenance", "Hosting & Maintenance"
    CONSULTING_SERVICE = "consulting_service", "Consulting"
    OTHER = "other", "Other / Generic"


class SurveyTemplate(models.Model):
    """
    A reusable question set. "Smart" selection happens in services.py:
    given a company's Industry (from the DW) and, optionally, the
    service line being surveyed, resolve_template_for_company() picks
    the best-matching active template, falling back to the generic
    default if nothing matches.
    """
    name = models.CharField(max_length=200)
    industry = models.CharField(max_length=30, choices=Industry.choices, default=Industry.OTHER)
    service_category = models.CharField(max_length=30, choices=ServiceCategory.choices, default=ServiceCategory.OTHER)
    description = models.TextField(blank=True, default="")
    is_default = models.BooleanField(
        default=False,
        help_text="Fallback template used when no industry/service match is found. Only one should be active at a time.",
    )
    is_active = models.BooleanField(default=True)
    is_prepared_draft = models.BooleanField(
        default=False,
        help_text="True for the auto-assembled per-company draft created by "
                  "prepare_survey_for_company() — hidden from the main template "
                  "management list, shown only in the Prepare Survey review step.",
    )
    prepared_for_code_company = models.CharField(
        max_length=50, null=True, blank=True, unique=True, db_index=True,
        help_text="Set only on prepared-draft templates — one standing draft per "
                  "company, reused until explicitly regenerated. NULL for every "
                  "normal (manually managed) template.",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["industry", "service_category", "name"]

    def __str__(self):
        return f"{self.name} ({self.get_industry_display()} / {self.get_service_category_display()})"


class QuestionType(models.TextChoices):
    RATING_5 = "rating_5", "Rating (1–5)"
    RATING_10 = "rating_10", "Rating (1–10)"
    NPS = "nps", "NPS (0–10, would you recommend us)"
    MULTIPLE_CHOICE = "multiple_choice", "Multiple choice (single-select)"
    MULTI_SELECT = "multi_select", "Multiple choice (multi-select)"
    YES_NO = "yes_no", "Yes / No"
    OPEN_TEXT = "open_text", "Open text"


class ScoringDimension(models.TextChoices):
    """
    Tags a question for the scoring engine — which bucket the answer
    feeds into when generate_survey_verdict() computes numeric scores.
    """
    SATISFACTION = "satisfaction", "Satisfaction"
    LOYALTY = "loyalty", "Loyalty"
    UPSELL_READINESS = "upsell_readiness", "Upsell readiness"
    NONE = "none", "Not scored (context only)"


class QuestionOrigin(models.TextChoices):
    """Where a question in a PREPARED DRAFT came from — lets prepare_survey_for_company()
    tell apart what was cloned from the default/industry templates vs. what the AI
    generated fresh, without affecting questions on the reusable templates themselves
    (those are always origin=MANUAL, since they're hand-authored)."""
    MANUAL = "manual", "Manually authored"
    DEFAULT = "default", "Copied from default template"
    INDUSTRY = "industry", "Copied from industry template"
    AI_GENERATED = "ai_generated", "AI-generated from subscription history"


class SurveyQuestion(models.Model):
    template = models.ForeignKey(SurveyTemplate, on_delete=models.CASCADE, related_name="questions")
    order = models.PositiveIntegerField(default=0)
    text = models.TextField()
    question_type = models.CharField(max_length=20, choices=QuestionType.choices, default=QuestionType.RATING_5)
    options = models.JSONField(
        null=True, blank=True,
        help_text="List of strings, only used when question_type=multiple_choice.",
    )
    scoring_dimension = models.CharField(max_length=20, choices=ScoringDimension.choices, default=ScoringDimension.NONE)
    weight = models.FloatField(default=1.0, help_text="Relative weight within its scoring dimension.")
    is_required = models.BooleanField(default=True)
    is_active = models.BooleanField(
        default=True,
        help_text=(
            "Deactivated instead of deleted once the question has real answers "
            "(SurveyResponse.question is CASCADE — deleting it would silently "
            "wipe every past answer). Inactive questions are excluded from new "
            "sends and public fills but stay visible in the template editor."
        ),
    )
    origin = models.CharField(max_length=20, choices=QuestionOrigin.choices, default=QuestionOrigin.MANUAL)

    # ── Conditional branching (used by the two upsell follow-up questions) ──
    depends_on_question = models.ForeignKey(
        "self", on_delete=models.SET_NULL, null=True, blank=True, related_name="dependents",
        help_text="If set, this question is only shown when depends_on_question's numeric "
                  "answer is >= show_if_min_value.",
    )
    show_if_min_value = models.FloatField(
        null=True, blank=True,
        help_text="Threshold for depends_on_question's answer (e.g. 4 means 'only show if "
                  "rated 4 or 5 stars'). Ignored if depends_on_question is not set.",
    )
    excludes_selected_from = models.ForeignKey(
        "self", on_delete=models.SET_NULL, null=True, blank=True, related_name="excluded_by",
        help_text="If set, whatever the client selected as the answer to this referenced "
                  "question is removed from THIS question's option list at fill-time — "
                  "e.g. 'services you use' feeding into 'services to explore next'.",
    )

    class Meta:
        ordering = ["template_id", "order"]

    def __str__(self):
        return f"[{self.template.name}] #{self.order} {self.text[:50]}"


class ClientContact(models.Model):
    """
    Client-side contact who receives surveys / newsletters.
    code_company is the DW's business key (Dim_Company.code_company) —
    kept as a plain field rather than a FK because the DW lives outside
    Django's model layer and is Talend-owned; joining is done in
    services.py via a warehouse lookup, not via a DB-level FK.

    Stored as text, matching the frontend's CustomerListItem.codeCompany
    (typed string throughout customers.ts) — the DW key isn't guaranteed
    to be purely numeric, so this avoids assuming a format it doesn't
    actually promise.
    """
    code_company = models.CharField(max_length=50, db_index=True)
    full_name = models.CharField(max_length=200)
    email = models.EmailField()
    role_title = models.CharField(max_length=150, blank=True, default="")
    is_primary = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [("code_company", "email")]
        ordering = ["code_company", "-is_primary", "full_name"]

    def __str__(self):
        return f"{self.full_name} <{self.email}> (company {self.code_company})"


class SurveyStatus(models.TextChoices):
    SENT = "sent", "Sent"
    COMPLETED = "completed", "Completed"
    EXPIRED = "expired", "Expired"


class Survey(models.Model):
    """
    One actual instance of a template sent to one contact. This is what
    the public link (/survey/<token>) resolves against — separate from
    SurveyTemplate, which is just the reusable question set.
    """
    template = models.ForeignKey(SurveyTemplate, on_delete=models.PROTECT, related_name="surveys")
    code_company = models.CharField(max_length=50, db_index=True)
    contact = models.ForeignKey(ClientContact, on_delete=models.SET_NULL, null=True, related_name="surveys")
    token = models.UUIDField(default=uuid.uuid4, unique=True, editable=False, db_index=True)
    status = models.CharField(max_length=20, choices=SurveyStatus.choices, default=SurveyStatus.SENT)
    sent_at = models.DateTimeField(null=True, blank=True)
    sent_by_email = models.EmailField(
        blank=True, default="",
        help_text="Email of whoever was logged in when this survey was sent — captured "
                  "from the frontend since Django itself has no auth layer. Used as the "
                  "default recipient for the AI next-steps report.",
    )
    completed_at = models.DateTimeField(null=True, blank=True)
    expires_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"Survey({self.template.name} -> {self.contact}) [{self.status}]"


class SurveyResponse(models.Model):
    """One answer to one question within one sent survey."""
    survey = models.ForeignKey(Survey, on_delete=models.CASCADE, related_name="responses")
    question = models.ForeignKey(SurveyQuestion, on_delete=models.CASCADE, related_name="responses")
    answer_value = models.JSONField(help_text="Number, string, or list depending on question_type.")
    answered_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [("survey", "question")]

    def __str__(self):
        return f"Response(survey={self.survey_id}, question={self.question_id})"


class VerdictStatus(models.TextChoices):
    PENDING = "pending", "Pending"
    READY = "ready", "Ready"
    FAILED = "failed", "Failed"


class VerdictSentiment(models.TextChoices):
    POSITIVE = "positive", "Positive"
    NEUTRAL = "neutral", "Neutral"
    NEGATIVE = "negative", "Negative"
    MIXED = "mixed", "Mixed"


class SurveyVerdict(models.Model):
    """
    The AI scoring + verdict engine's stored output for one completed
    Survey. One row per survey (1:1) — every re-run overwrites it in
    place and bumps generation_count, so the fiche client always shows
    the latest read, not a growing history.

    Numeric scores (satisfaction/loyalty/upsell_readiness/overall) are
    computed deterministically in Python from the weighted answers —
    same weighted-average pattern as the Company Loyalty DAX table, so
    the numbers stay explainable. The qualitative fields (sentiment,
    summary, riskFlags, recommendedActions) come from an LLM call via
    Gen_BI.llm_client.chat(), grounded in the actual Q&A pairs
    including open-text answers.
    """
    survey = models.OneToOneField(Survey, on_delete=models.CASCADE, related_name="verdict")
    status = models.CharField(max_length=10, choices=VerdictStatus.choices, default=VerdictStatus.PENDING)

    overall_score = models.FloatField(null=True, blank=True)
    satisfaction_score = models.FloatField(null=True, blank=True)
    loyalty_score = models.FloatField(null=True, blank=True)
    upsell_readiness_score = models.FloatField(null=True, blank=True)

    sentiment = models.CharField(max_length=10, choices=VerdictSentiment.choices, blank=True, default="")
    summary = models.TextField(blank=True, default="")
    risk_flags = models.JSONField(default=list, blank=True)
    recommended_actions = models.JSONField(
        default=list, blank=True,
        help_text='List of {"label": str, "category": "retention|upsell|content|outreach|support"}.',
    )
    next_steps_report = models.TextField(
        blank=True, default="",
        help_text="Longer, narrative next-steps report — a separate, more thorough "
                  "LLM call than the short summary above. Emailed automatically to "
                  "REPORT_RECIPIENT_EMAILS once generated.",
    )

    model_used = models.CharField(max_length=100, blank=True, default="")
    error_message = models.TextField(blank=True, default="")
    generation_count = models.PositiveIntegerField(default=0)
    generated_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    # ── Next-steps report email tracking ────────────────────────────────
    report_sent_at = models.DateTimeField(
        null=True, blank=True,
        help_text="Set when the next-steps PDF report was successfully emailed. "
                  "NULL if it was never sent, or the most recent attempt failed.",
    )
    report_send_error = models.TextField(
        blank=True, default="",
        help_text="Populated if the most recent report-email attempt failed "
                  "(e.g. no recipient available). Cleared on a successful send.",
    )

    def __str__(self):
        return f"Verdict(survey={self.survey_id}) [{self.status}]"


class NotificationEventType(models.TextChoices):
    """
    Non-exhaustive by design: notify() (in services.py) accepts any
    event_type string, and Django's CharField choices aren't enforced
    at .objects.create() time — so deals/projects can pass their own
    event types (deal_won, task_created, ...) without a migration here.
    These are just the ones this app itself raises, kept as choices for
    admin/readability.
    """
    SURVEY_SENT = "survey_sent", "Survey sent"
    SURVEY_COMPLETED = "survey_completed", "Survey completed"
    VERDICT_READY = "verdict_ready", "AI verdict ready"
    DEAL_CREATED = "deal_created", "Deal created"
    DEAL_WON = "deal_won", "Deal won"
    DEAL_LOST = "deal_lost", "Deal lost"
    PROJECT_CREATED = "project_created", "Project created"
    TASK_CREATED = "task_created", "Task created"


class Notification(models.Model):
    """
    A CRM alert for the Customer Success role — surfaced in the TopBar
    bell. There's no Django user model (auth lives in Better Auth, a
    separate Node/Drizzle database Django can't join against), so this
    is a SHARED inbox: is_read is global, not per-user. Every
    customer_success user sees the same list and the same read state.

    related_type/related_id are plain text, not a FK — Deal, Project,
    and Task aren't Django models at all (raw SQL only against the
    warehouse), so there's nothing to point a ForeignKey at. Even
    Survey (which IS a real Django model) goes through these generic
    fields rather than a dedicated FK, so every domain — surveys,
    deals, projects — shares one shape and one notify() call site.
    """
    event_type = models.CharField(max_length=30, choices=NotificationEventType.choices)
    title = models.CharField(max_length=200)
    body = models.CharField(max_length=500, blank=True, default="")
    code_company = models.CharField(max_length=50, blank=True, default="", db_index=True)
    related_type = models.CharField(max_length=30, blank=True, default="")
    related_id = models.CharField(max_length=50, blank=True, default="")
    is_read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"[{self.event_type}] {self.title}"


class SurveyCleanupRun(models.Model):
    """
    One row per execution of `python manage.py cleanup_old_surveys` —
    whether triggered by Task Scheduler/cron or run manually, and
    whether it was a real run or --dry-run. Exists so the quarterly
    unanswered-survey retention policy is demonstrable/auditable rather
    than an invisible background script — e.g. for a PFE defense, or
    just to sanity-check the scheduled job is actually firing.

    `details` is a capped JSON snapshot (id/company/template/status/
    created_at) of the surveys the run targeted, so a run can be
    inspected after the fact even though the surveys themselves are
    gone by then for a real (non-dry-run) execution.
    """
    ran_at = models.DateTimeField(auto_now_add=True, db_index=True)
    cutoff_days = models.PositiveIntegerField()
    was_dry_run = models.BooleanField(default=False)
    deleted_count = models.PositiveIntegerField(default=0)
    details = models.JSONField(default=list, blank=True)

    class Meta:
        ordering = ["-ran_at"]

    def __str__(self):
        kind = "DRY RUN" if self.was_dry_run else "DELETED"
        return f"[{kind}] {self.ran_at:%Y-%m-%d %H:%M} — {self.deleted_count} survey(s)"