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
    BANKING_FINANCE = "banking_finance", "Banking & Finance"
    CONSULTING = "consulting", "Consulting & Audit"
    AGRO_FOOD = "agro_food", "Agro-food"
    EDUCATION = "education", "Education & Research"
    TELECOM = "telecom", "Telecom"
    RETAIL = "retail", "Retail & Distribution"
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
    MULTIPLE_CHOICE = "multiple_choice", "Multiple choice"
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

    model_used = models.CharField(max_length=100, blank=True, default="")
    error_message = models.TextField(blank=True, default="")
    generation_count = models.PositiveIntegerField(default=0)
    generated_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

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