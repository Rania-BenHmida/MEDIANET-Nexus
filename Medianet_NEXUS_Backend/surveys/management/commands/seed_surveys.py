"""
python manage.py seed_surveys

Seeds the default template plus one template per curated industry (see
models.Industry) — 12 templates total. Idempotent: re-running updates
each one in place, matched by name, so editing this file and re-running
is the normal workflow for refining wording, not a one-off.

The default template's two upsell follow-up questions ("which services do
you use" / "which would you explore next") are REAL, editable rows here —
not generated in code at prepare-time. That means they show up and can be
edited like any other question on the Templates page, and get cloned onto
every prepared draft automatically (prepare_survey_for_company() clones
whatever's on the default template, including their depends_on_question /
excludes_selected_from wiring, remapped onto the new cloned rows).

Industry templates hold only the EXTRA questions on top of the default —
prepare_survey_for_company() combines both automatically when a company's
mapped industry matches, so nothing here duplicates COMMON_QUESTIONS.
"""

from django.core.management.base import BaseCommand
from surveys.models import SurveyTemplate, SurveyQuestion, Industry, ServiceCategory

COMMON_QUESTIONS = [
    dict(text="Overall, how satisfied are you with MEDIANET's service over the past period?",
         question_type="rating_5", scoring_dimension="satisfaction", weight=2.0),
    dict(text="How likely are you to recommend MEDIANET to a colleague or partner?",
         question_type="nps", scoring_dimension="loyalty", weight=2.0),
    dict(text="How well did we meet the deadlines agreed for this engagement?",
         question_type="rating_5", scoring_dimension="satisfaction", weight=1.0),
    dict(text="How likely are you to explore additional MEDIANET services in the next 6 months?",
         question_type="rating_5", scoring_dimension="upsell_readiness", weight=1.5),
    dict(text="Is there anything specific you'd like to see us improve?",
         question_type="open_text", scoring_dimension="none", weight=1.0, is_required=False),
]
UPSELL_GATE_INDEX = 3  # index into COMMON_QUESTIONS of the rating question the follow-ups depend on

UPSELL_FOLLOWUP_OPTIONS = [
                              label for value, label in ServiceCategory.choices if value != ServiceCategory.OTHER
                          ] + ["Other"]

DEFAULT_TEMPLATE_META = dict(
    name="Generic — Default",
    industry=Industry.OTHER,
    service_category=ServiceCategory.OTHER,
    description="Baseline questions included in every prepared survey, regardless of industry.",
    is_default=True,
)

INDUSTRY_TEMPLATES = [
    dict(
        name="Manufacturing — Service Review",
        industry=Industry.MANUFACTURING,
        service_category=ServiceCategory.OTHER,
        description="For manufacturing clients — emphasis on operational reliability and production-critical support.",
        questions=[
            dict(text="How well have our digital solutions helped streamline your production or supply chain visibility?",
                 question_type="rating_5", scoring_dimension="satisfaction", weight=1.5),
            dict(text="How responsive was our team when production-critical systems needed urgent support?",
                 question_type="rating_5", scoring_dimension="satisfaction", weight=1.5),
        ],
    ),
    dict(
        name="Services — Engagement Feedback",
        industry=Industry.SERVICES,
        service_category=ServiceCategory.OTHER,
        description="For professional services firms — emphasis on brand alignment and confidentiality.",
        questions=[
            dict(text="How well do our deliverables align with your firm's professional standards and branding guidelines?",
                 question_type="rating_5", scoring_dimension="satisfaction", weight=1.5),
            dict(text="How would you rate our confidentiality and data-handling practices during this engagement?",
                 question_type="rating_5", scoring_dimension="satisfaction", weight=2.0),
        ],
    ),
    dict(
        name="Tourism — Service Review",
        industry=Industry.TOURISM,
        service_category=ServiceCategory.OTHER,
        description="For hospitality/tourism clients — emphasis on seasonal load and booking impact.",
        questions=[
            dict(text="How well did our platform perform during your peak booking or high-traffic season?",
                 question_type="rating_5", scoring_dimension="satisfaction", weight=1.5),
            dict(text="How likely are you to attribute an increase in direct bookings or inquiries to our work?",
                 question_type="rating_5", scoring_dimension="upsell_readiness", weight=1.5),
        ],
    ),
    dict(
        name="Food & Beverage — Service Review",
        industry=Industry.FOOD_BEVERAGE,
        service_category=ServiceCategory.OTHER,
        description="For agro-food/FMCG clients — emphasis on support responsiveness and reach.",
        questions=[
            dict(text="How responsive was our support team when operational issues came up?",
                 question_type="rating_5", scoring_dimension="satisfaction", weight=1.5),
            dict(text="How well did our solutions help you reach new distribution channels or customers?",
                 question_type="rating_5", scoring_dimension="upsell_readiness", weight=1.5),
        ],
    ),
    dict(
        name="NGO & Development — Partnership Review",
        industry=Industry.NGO_DEVELOPMENT,
        service_category=ServiceCategory.OTHER,
        description="For NGOs/development organizations — emphasis on donor compliance and budget efficiency.",
        questions=[
            dict(text="How well did we accommodate your organization's donor-reporting and compliance requirements?",
                 question_type="rating_5", scoring_dimension="satisfaction", weight=2.0),
            dict(text="How cost-effective did you find our services relative to your program's budget constraints?",
                 question_type="rating_5", scoring_dimension="satisfaction", weight=1.5),
        ],
    ),
    dict(
        name="Banking — Quarterly CSAT",
        industry=Industry.BANKING,
        service_category=ServiceCategory.OTHER,
        description="For regulated banking clients — emphasis on security, compliance, and audit scrutiny.",
        questions=[
            dict(text="How confident are you in our handling of data security and regulatory compliance requirements?",
                 question_type="rating_5", scoring_dimension="satisfaction", weight=2.0),
            dict(text="How well did our team perform under your internal audit or risk review processes?",
                 question_type="rating_5", scoring_dimension="satisfaction", weight=1.5),
        ],
    ),
    dict(
        name="Education — Partnership Review",
        industry=Industry.EDUCATION,
        service_category=ServiceCategory.OTHER,
        description="For academic institution clients — emphasis on institutional constraints and engagement value.",
        questions=[
            dict(text="How well did we adapt to your institution's specific constraints (budget cycles, approvals, etc.)?",
                 question_type="rating_5", scoring_dimension="satisfaction", weight=1.5),
            dict(text="How useful have our solutions been in supporting student or faculty engagement?",
                 question_type="rating_5", scoring_dimension="satisfaction", weight=1.0),
        ],
    ),
    dict(
        name="Advertising & Marketing — Engagement Feedback",
        industry=Industry.ADVERTISING_MARKETING,
        service_category=ServiceCategory.DIGITAL_MARKETING,
        description="For agency clients — emphasis on creative alignment and turnaround speed.",
        questions=[
            dict(text="How well did our work integrate with your broader creative and campaign strategy?",
                 question_type="rating_5", scoring_dimension="satisfaction", weight=1.5),
            dict(text="How would you rate our turnaround speed on creative or technical feedback requests?",
                 question_type="rating_5", scoring_dimension="satisfaction", weight=1.5),
        ],
    ),
    dict(
        name="Staffing & Recruitment — Service Review",
        industry=Industry.STAFFING_RECRUITMENT,
        service_category=ServiceCategory.OTHER,
        description="For staffing/recruitment clients — emphasis on workflow support and growth potential.",
        questions=[
            dict(text="How well did our platform or tools support your candidate sourcing and placement workflows?",
                 question_type="rating_5", scoring_dimension="satisfaction", weight=1.5),
            dict(text="How likely are you to expand our engagement to additional markets or business lines?",
                 question_type="rating_5", scoring_dimension="upsell_readiness", weight=1.5),
        ],
    ),
    dict(
        name="Telecom — Service Review",
        industry=Industry.TELECOM,
        service_category=ServiceCategory.OTHER,
        description="For telecom operator clients — emphasis on scale and future expansion readiness.",
        questions=[
            dict(text="How well did our solutions scale to handle your customer or network volume?",
                 question_type="rating_5", scoring_dimension="satisfaction", weight=1.5),
            dict(text="How confident are you in our ability to support future network or platform expansions?",
                 question_type="rating_5", scoring_dimension="upsell_readiness", weight=1.5),
        ],
    ),
    dict(
        name="Postal Services — Service Review",
        industry=Industry.POSTAL_SERVICES,
        service_category=ServiceCategory.OTHER,
        description="For postal/logistics clients — emphasis on tracking, delivery operations, and responsiveness.",
        questions=[
            dict(text="How well did our solutions support your tracking, logistics, or delivery operations?",
                 question_type="rating_5", scoring_dimension="satisfaction", weight=1.5),
            dict(text="How responsive was our team to operational issues affecting service delivery?",
                 question_type="rating_5", scoring_dimension="satisfaction", weight=1.5),
        ],
    ),
]


class Command(BaseCommand):
    help = "Seed the default survey template (with its conditional upsell follow-ups) and all curated industry templates."

    def handle(self, *args, **options):
        self._seed_default_template()
        for tmpl in INDUSTRY_TEMPLATES:
            self._seed_simple_template(tmpl)
        self.stdout.write(self.style.SUCCESS(f"Done. Seeded 1 default + {len(INDUSTRY_TEMPLATES)} industry templates."))

    def _seed_default_template(self):
        template, _ = SurveyTemplate.objects.update_or_create(
            name=DEFAULT_TEMPLATE_META["name"],
            defaults={**DEFAULT_TEMPLATE_META, "is_active": True, "is_prepared_draft": False},
        )
        template.questions.all().delete()

        created = [
            SurveyQuestion.objects.create(template=template, order=i, origin="manual", **q)
            for i, q in enumerate(COMMON_QUESTIONS)
        ]
        upsell_gate = created[UPSELL_GATE_INDEX]

        used_q = SurveyQuestion.objects.create(
            template=template, order=len(created),
            text="Which of these MEDIANET services do you currently use?",
            question_type="multi_select", options=UPSELL_FOLLOWUP_OPTIONS,
            scoring_dimension="none", weight=1.0, is_required=False, origin="manual",
            depends_on_question=upsell_gate, show_if_min_value=3,
        )
        SurveyQuestion.objects.create(
            template=template, order=len(created) + 1,
            text="Which of our other services would you be interested in exploring?",
            question_type="multi_select", options=UPSELL_FOLLOWUP_OPTIONS,
            scoring_dimension="upsell_readiness", weight=1.0, is_required=False, origin="manual",
            depends_on_question=upsell_gate, show_if_min_value=3,
            excludes_selected_from=used_q,
        )

        total = len(created) + 2
        self.stdout.write(self.style.SUCCESS(f"Seeded '{template.name}' with {total} questions (incl. 2 conditional upsell follow-ups)."))

    def _seed_simple_template(self, tmpl: dict):
        tmpl = dict(tmpl)
        questions = tmpl.pop("questions")
        template, _ = SurveyTemplate.objects.update_or_create(
            name=tmpl["name"],
            defaults={**tmpl, "is_default": False, "is_active": True, "is_prepared_draft": False},
        )
        template.questions.all().delete()
        for i, q in enumerate(questions):
            SurveyQuestion.objects.create(template=template, order=i, origin="manual", **q)
        self.stdout.write(self.style.SUCCESS(f"Seeded '{template.name}' with {len(questions)} questions."))