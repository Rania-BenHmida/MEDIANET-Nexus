"""
accounts/views.py

Single internal endpoint the Node/Better-Auth side calls for the two
onboarding emails — Django owns the working Gmail SMTP setup (same one
surveys/services.py uses for report + survey-invite emails), so rather
than duplicating SMTP config in Node, Node POSTs here and Django sends.

Visual style is deliberately copy-pasted from surveys/services.py
(create_and_send_survey's logo_html/html_body, and _render_report_html)
rather than invented fresh — same MEDIANET wordmark, same brand hex
constants, same plain Arial layout, same button/footer treatment — so
every email NEXUS sends looks like it came from the same product.

Protected by a shared-secret header (X-Internal-Key) since this endpoint
sends email on demand — anyone who could reach it unauthenticated could
spam arbitrary inboxes. Intentionally lightweight (not full auth) to match
the rest of the Django API for now; the broader "no auth on Django
endpoints" gap stays a separate, already-flagged item for after the roles
work settles.

Events:
  - "new_signup": tells IT specialists a new account exists and needs a role.
      recipients: [it_specialist emails]
      context: {"name": str, "email": str}
  - "role_assigned": tells the new joiner their access is ready.
      recipients: [new joiner's email]
      context: {"name": str, "role_label": str}
"""
import json

from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.http import JsonResponse

# Same constants as surveys/services.py's _render_report_pdf — kept in sync
# by hand since Django's raw-SQL-first setup here doesn't have a shared
# "brand.py" to import from yet.
NAVY, ORANGE, CYAN, CORAL = "#182860", "#F5A623", "#00AADD", "#EA564B"

# Identical markup to create_and_send_survey's logo_html.
_LOGO_HTML = (
    '<p style="font-size:13px; font-weight:bold; letter-spacing:1px; color:#F5A623; '
    'text-transform:uppercase; margin-bottom:18px;">MEDIA<span style="color:#00AADD;">NET</span></p>'
)


def _wrap_html(heading: str, body_html: str, cta_label: str | None, cta_link: str | None, footnote: str, signoff: str) -> str:
    """Same shape as create_and_send_survey's html_body: logo, h2, paragraph, centered button, small footnote, signoff."""
    cta_html = ""
    if cta_label and cta_link:
        cta_html = f"""
      <div style="text-align:center; margin:28px 0;">
        <a href="{cta_link}" style="background:{CYAN}; color:white; text-decoration:none; font-weight:bold;
                                  padding:12px 28px; border-radius:6px; display:inline-block; font-size:14px;">
          {cta_label}
        </a>
      </div>"""
    return f"""
    <div style="font-family: Arial, sans-serif; color:{NAVY}; max-width:520px; margin:0 auto;">
      {_LOGO_HTML}
      <h2 style="margin-top:0; margin-bottom:6px;">{heading}</h2>
      <p style="color:#333; line-height:1.6;">
        {body_html}
      </p>
      {cta_html}
      <p style="color:#888; font-size:12px; text-align:center;">{footnote}</p>
      <p style="color:#333; margin-top:24px;">{signoff}</p>
    </div>
    """


def _send(subject: str, plain_body: str, html_body: str, recipients: list[str]):
    email = EmailMultiAlternatives(subject, plain_body, settings.DEFAULT_FROM_EMAIL, recipients)
    email.attach_alternative(html_body, "text/html")
    email.send(fail_silently=False)


def _handle_new_signup(recipients: list[str], context: dict):
    name = context.get("name") or "Someone"
    email = context.get("email") or ""
    admin_link = f"{settings.FRONTEND_URL}/admin"
    subject = "MEDIANET — New Signup Awaiting a Role"

    plain_body = (
        f"Hi,\n\n"
        f"{name} ({email}) just created a MEDIANET NEXUS account and has no role yet, "
        f"so they can't access anything until one is assigned.\n\n"
        f"Assign a role here:\n{admin_link}\n\n"
        f"Thank you,\nMEDIANET NEXUS"
    )
    html_body = _wrap_html(
        heading="A new account is waiting on a role",
        body_html=f"Hi,<br/><br/><strong>{name}</strong> ({email}) just created a MEDIANET NEXUS account "
                  f"and has no role yet, so they can't access anything until one is assigned.",
        cta_label="Assign a Role",
        cta_link=admin_link,
        footnote="You're receiving this because you're an IT Specialist on MEDIANET NEXUS.",
        signoff="Thank you,<br/>MEDIANET NEXUS",
    )
    _send(subject, plain_body, html_body, recipients)


def _handle_role_assigned(recipients: list[str], context: dict):
    name = context.get("name") or "there"
    role_label = context.get("role_label") or "a new role"
    login_link = f"{settings.FRONTEND_URL}/login"
    subject = "MEDIANET — Your Access Is Ready"

    plain_body = (
        f"Hi {name},\n\n"
        f"You've been assigned the \"{role_label}\" role on MEDIANET NEXUS — you can log in now.\n\n"
        f"{login_link}\n\n"
        f"Thank you,\nMEDIANET NEXUS"
    )
    html_body = _wrap_html(
        heading="You're all set",
        body_html=f"Hi {name},<br/><br/>You've been assigned the <strong>{role_label}</strong> role "
                  f"on MEDIANET NEXUS — you can log in now.",
        cta_label="Log In",
        cta_link=login_link,
        footnote="If you weren't expecting this, contact your IT Specialist.",
        signoff="Thank you,<br/>MEDIANET NEXUS",
    )
    _send(subject, plain_body, html_body, recipients)


_HANDLERS = {
    "new_signup": _handle_new_signup,
    "role_assigned": _handle_role_assigned,
}


def send_account_email(request):
    if request.method != "POST":
        return JsonResponse({"error": "POST required"}, status=405)

    expected_key = getattr(settings, "INTERNAL_API_KEY", "")
    if not expected_key or request.headers.get("X-Internal-Key") != expected_key:
        return JsonResponse({"error": "Forbidden"}, status=403)

    try:
        payload = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({"error": "Invalid JSON"}, status=400)

    event = payload.get("event")
    recipients = [r for r in (payload.get("recipients") or []) if r]
    context = payload.get("context") or {}

    handler = _HANDLERS.get(event)
    if handler is None:
        return JsonResponse({"error": f"Unknown event: {event}"}, status=400)
    if not recipients:
        return JsonResponse({"error": "No recipients"}, status=400)

    try:
        handler(recipients, context)
    except Exception as e:
        return JsonResponse({"error": f"Send failed: {e}"}, status=502)

    return JsonResponse({"ok": True})