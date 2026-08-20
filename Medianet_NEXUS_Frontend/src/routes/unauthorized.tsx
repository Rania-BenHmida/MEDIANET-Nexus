import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { ShieldOff, Clock3, LogIn, LogOut, Mail } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { getHomeRoute } from "@/lib/roles";

export const Route = createFileRoute("/unauthorized")({
  component: Unauthorized,
});

// Same brand palette as Reports/Projects/Customers/Deals.
const BRAND = {
  blue:   "#2E5FD9",
  purple: "#8C5AC8",
  coral:  "#F0564B",
  orange: "#F5A623",
  teal:   "#3EC8C8",
  navy:   "#1B2A5B",
};

function Shell({
  color,
  icon,
  title,
  description,
  children,
}: {
  color: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="min-h-screen grid place-items-center bg-background px-4">
      <div className="max-w-md w-full text-center">
        <div className="bg-card border border-border rounded-2xl shadow-[var(--shadow-card)] p-8 border-t-4 space-y-4" style={{ borderTopColor: color }}>
          <div className="size-12 rounded-xl grid place-items-center mx-auto" style={{ backgroundColor: `${color}1a` }}>
            <span style={{ color }}>{icon}</span>
          </div>
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
          {children}
        </div>
      </div>
    </div>
  );
}

function GradientLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      style={{ background: `linear-gradient(90deg, ${BRAND.blue}, ${BRAND.purple})` }}
      className="inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition-opacity"
    >
      {children}
    </Link>
  );
}

function Unauthorized() {
  const { loading, session, roles, signOut } = useAuth();

  // Loading — don't flash the wrong state while the session/roles are
  // still resolving (matters most when landing here directly, e.g. to
  // preview this page without being logged in).
  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center bg-background">
        <div className="size-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  // Not signed in at all — direct visit, expired session, or logged out.
  if (!session) {
    return (
      <Shell
        color={BRAND.navy}
        icon={<LogIn className="size-6" />}
        title="Sign in required"
        description="You need to be signed in to access MEDIANET NEXUS."
      >
        <div className="pt-2">
          <GradientLink to="/login">Log in</GradientLink>
        </div>
      </Shell>
    );
  }

  // Signed in, zero roles — a brand-new account waiting on an IT Specialist.
  if (roles.length === 0) {
    return (
      <Shell
        color={BRAND.coral}
        icon={<Clock3 className="size-6" />}
        title="You're almost there"
        description="Your account is set up, but no role has been assigned yet — an IT Specialist needs to grant you access before you can use MEDIANET NEXUS. You'll get an email the moment it's ready."
      >
        <div className="flex items-center justify-center gap-3 pt-2">
          <a
            href="mailto:?subject=MEDIANET NEXUS — role request"
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors"
          >
            <Mail className="size-3.5" style={{ color: BRAND.blue }} />
            Contact IT
          </a>
          <button
            onClick={() => void signOut()}
            className="inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <LogOut className="size-3.5" />
            Sign out
          </button>
        </div>
      </Shell>
    );
  }

  // Signed in, has role(s) — but before assuming they're denied, check
  // whether those roles can actually reach *something*. This is the fix
  // for the "stuck showing Access denied even as superadmin" bug: this
  // page used to show the denial card unconditionally for anyone with a
  // role, regardless of what changed since they landed here (switched
  // accounts, got a new role assigned, etc). Now it re-checks live and
  // bounces them to somewhere real instead of trusting stale intent.
  const homeRoute = getHomeRoute(roles);
  if (homeRoute) {
    return <Navigate to={homeRoute} replace />;
  }

  // Only reached if these roles genuinely can't access anything at all —
  // shouldn't happen with any role defined in roles.ts today, but kept as
  // an honest fallback rather than assuming it's impossible.
  return (
    <Shell
      color={BRAND.coral}
      icon={<ShieldOff className="size-6" />}
      title="Access denied"
      description="Your role doesn't have access to this section. Contact an administrator if you need additional permissions."
    >
      <div className="flex items-center justify-center gap-3 pt-2">
        <button
          onClick={() => void signOut()}
          style={{ background: `linear-gradient(90deg, ${BRAND.blue}, ${BRAND.purple})` }}
          className="inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition-opacity"
        >
          <LogOut className="size-3.5" />
          Sign out
        </button>
      </div>
    </Shell>
  );
}