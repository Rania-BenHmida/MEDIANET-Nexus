"""
python manage.py seed_survey_templates

Creates one generic default template plus one per stakeholder industry
(BIAT -> banking_finance, EY -> consulting, Lilas/Natilait -> agro_food,
SUP'COM -> education), each with a starter question set already tagged
by scoring_dimension. Idempotent: re-running updates existing rows
matched by (name) instead of duplicating them.
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

TEMPLATES = [
    dict(
        name="Generic — Default",
        industry=Industry.OTHER,
        service_category=ServiceCategory.OTHER,
        description="Catch-all template used when no industry/service-specific template matches.",
        is_default=True,
        questions=COMMON_QUESTIONS,
    ),
    dict(
        name="Banking & Finance — Quarterly CSAT",
        industry=Industry.BANKING_FINANCE,
        service_category=ServiceCategory.OTHER,
        description="Tailored for regulated financial clients (e.g. banks, insurers) — extra emphasis on reliability and compliance-sensitive delivery.",
        questions=COMMON_QUESTIONS + [
            dict(text="How confident are you in our handling of data security and compliance requirements?",
                 question_type="rating_5", scoring_dimension="satisfaction", weight=2.0),
        ],
    ),
    dict(
        name="Consulting & Audit — Engagement Feedback",
        industry=Industry.CONSULTING,
        service_category=ServiceCategory.CONSULTING_SERVICE,
        description="For consulting/audit firm clients — emphasis on responsiveness and strategic value delivered.",
        questions=COMMON_QUESTIONS + [
            dict(text="How well did our team understand your strategic objectives?",
                 question_type="rating_5", scoring_dimension="satisfaction", weight=1.5),
        ],
    ),
    dict(
        name="Agro-food — Service Review",
        industry=Industry.AGRO_FOOD,
        service_category=ServiceCategory.OTHER,
        description="For agro-food/FMCG clients — emphasis on operational reliability and support responsiveness.",
        questions=COMMON_QUESTIONS + [
            dict(text="How responsive was our support team when issues came up?",
                 question_type="rating_5", scoring_dimension="satisfaction", weight=1.5),
        ],
    ),
    dict(
        name="Education & Research — Partnership Review",
        industry=Industry.EDUCATION,
        service_category=ServiceCategory.OTHER,
        description="For academic/research institution clients — emphasis on collaboration quality over pure transaction.",
        questions=COMMON_QUESTIONS + [
            dict(text="How well did we adapt to your institution's specific constraints (budget cycles, approvals, etc.)?",
                 question_type="rating_5", scoring_dimension="satisfaction", weight=1.5),
        ],
    ),
]


class Command(BaseCommand):
    help = "Seed default survey templates and starter questions."

    def handle(self, *args, **options):
        for tmpl in TEMPLATES:
            questions = tmpl.pop("questions")
            template, created = SurveyTemplate.objects.update_or_create(
                name=tmpl["name"],
                defaults=tmpl,
            )
            template.questions.all().delete()
            for i, q in enumerate(questions):
                SurveyQuestion.objects.create(template=template, order=i, **q)
            verb = "Created" if created else "Updated"
            self.stdout.write(self.style.SUCCESS(f"{verb} '{template.name}' with {len(questions)} questions."))

        self.stdout.write(self.style.SUCCESS("Done."))