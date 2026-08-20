"""
python manage.py cleanup_old_templates [--force]

Removes the industry-specific templates created by the OLD seed_surveys.py,
identified by name (not by industry value — some old industry slugs like
"education"/"telecom" coincidentally still exist in the new curated list,
so matching by industry risks nuking a legitimately re-created template).
The default template ("Generic — Default") is never touched here — the
new seed_surveys.py already updates it in place.

Safe by default: if any of these templates were actually used to send a
real survey (Survey.template is PROTECT), Django blocks the delete rather
than silently orphaning history. Those get DEACTIVATED (is_active=False)
instead of deleted, and reported separately, unless --force is passed to
still attempt the delete (will still fail loudly if truly protected —
--force does not bypass PROTECT, it just skips the deactivate-instead
fallback so you see the real error).
"""

from django.core.management.base import BaseCommand
from django.db.models import ProtectedError
from surveys.models import SurveyTemplate

OLD_TEMPLATE_NAMES = [
    "Banking & Finance — Quarterly CSAT",
    "Consulting & Audit — Engagement Feedback",
    "Agro-food — Service Review",
    "Education & Research — Partnership Review",
]


class Command(BaseCommand):
    help = "Remove the old pre-industry-overhaul survey templates (safe: deactivates instead of deleting if actually used)."

    def add_arguments(self, parser):
        parser.add_argument(
            "--force", action="store_true",
            help="Skip the deactivate-instead fallback; let a real PROTECT error surface.",
        )

    def handle(self, *args, **options):
        qs = SurveyTemplate.objects.filter(name__in=OLD_TEMPLATE_NAMES, is_default=False)

        if not qs.exists():
            self.stdout.write(self.style.WARNING("No old templates found — nothing to do."))
            return

        self.stdout.write(f"Found {qs.count()} old template(s):")
        for t in qs:
            self.stdout.write(f"  - {t.name} (id={t.id}, industry={t.industry})")

        deleted, deactivated = 0, 0
        for t in list(qs):
            try:
                t.delete()
                deleted += 1
            except ProtectedError:
                if options["force"]:
                    raise
                t.is_active = False
                t.save(update_fields=["is_active"])
                deactivated += 1
                self.stdout.write(self.style.WARNING(
                    f"  '{t.name}' has real sent surveys attached — deactivated instead of deleted."
                ))

        self.stdout.write(self.style.SUCCESS(
            f"Done. Deleted {deleted}, deactivated {deactivated} (had real survey history)."
        ))