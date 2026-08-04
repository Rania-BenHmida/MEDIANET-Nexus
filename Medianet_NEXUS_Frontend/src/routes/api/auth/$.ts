import { createFileRoute } from "@tanstack/react-router";
import { auth } from "@/lib/auth";

// Mounts better-auth's handler at /api/auth/* (sign-in, sign-up, OAuth
// callbacks, session, sign-out, etc.). better-auth reads the method +
// path itself, so we just forward the raw Request.
async function handler({ request }: { request: Request }) {
  return auth.handler(request);
}

export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: handler,
      POST: handler,
    },
  },
});