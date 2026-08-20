// Server-side only — calls Django's accounts/send-account-email/ endpoint to
// send the two onboarding emails (new signup -> IT specialists, role
// assigned -> the new joiner). Never called from the browser: DJANGO_API_URL
// and INTERNAL_API_KEY are both unprefixed (no VITE_), so they're only
// readable in this Node process, not bundled into client JS.
//
// Best-effort by design — every call site wraps this in try/catch and treats
// a failure as a warning, never something that blocks signup or role
// assignment. An IT specialist not getting notified is recoverable (they
// still see pending users on the Roles page); breaking auth over an email
// hiccup is not.

const DJANGO_API_URL = process.env.DJANGO_API_URL ?? "http://localhost:8000/api";
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY ?? "";

type AccountEmailEvent =
  | { event: "new_signup"; recipients: string[]; context: { name: string; email: string } }
  | { event: "role_assigned"; recipients: string[]; context: { name: string; role_label: string } };

export async function sendAccountEmail(payload: AccountEmailEvent): Promise<void> {
  if (!INTERNAL_API_KEY) {
    console.warn("[accounts] INTERNAL_API_KEY is not set — skipping account email:", payload.event);
    return;
  }
  if (payload.recipients.length === 0) {
    console.warn("[accounts] No recipients for account email:", payload.event);
    return;
  }

  const res = await fetch(`${DJANGO_API_URL}/accounts/send-account-email/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Internal-Key": INTERNAL_API_KEY,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`send-account-email failed (${res.status}): ${body}`);
  }
}