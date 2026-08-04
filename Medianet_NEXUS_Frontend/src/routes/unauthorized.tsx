import { createFileRoute, Link } from "@tanstack/react-router";
import { ShieldOff } from "lucide-react";

export const Route = createFileRoute("/unauthorized")({
  component: Unauthorized,
});

function Unauthorized() {
  return (
    <div className="min-h-screen grid place-items-center bg-background px-4">
      <div className="max-w-md text-center space-y-4">
        <div className="size-12 rounded-xl bg-destructive/10 text-destructive grid place-items-center mx-auto">
          <ShieldOff className="size-6" />
        </div>
        <h1 className="text-xl font-semibold">Access denied</h1>
        <p className="text-sm text-muted-foreground">
          Your role doesn't have access to this section. Contact an administrator if you need
          additional permissions.
        </p>
        <Link
          to="/dashboard"
          className="inline-flex rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
