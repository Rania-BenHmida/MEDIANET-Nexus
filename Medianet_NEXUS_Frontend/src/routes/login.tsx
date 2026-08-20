import { createFileRoute, Navigate, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import {
  Building2,
  ListChecks,
  MessagesSquare,
  Bot,
  Mail,
  Lock,
  Loader2,
} from "lucide-react";
// Full-color "MEDIANET NEXUS" wordmark, transparent background — used only
// on this page, distinct from the mark used in the sidebar. Drop the file
// wherever you keep static images in your repo and fix this path to match.
import logoUrl from "../../data/images/logo-medianet-nexus-color.png";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

const MODULES = [
  {
    icon: Building2,
    label: "Customer 360°",
    blurb: "Full account history, contacts, and health in one profile",
  },
  {
    icon: ListChecks,
    label: "Project Tracking",
    blurb: "Real-time delivery status across every engagement",
  },
  {
    icon: MessagesSquare,
    label: "Voice of Customer",
    blurb: "Automated satisfaction surveys with verdict reports",
  },
  {
    icon: Bot,
    label: "GenBI Assistant",
    blurb: "Ask a question, get the answer straight from the warehouse",
  },
];

function LoginPage() {
  const { session, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  if (!authLoading && session) return <Navigate to="/dashboard" />;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signin") {
        const { error } = await authClient.signIn.email({ email, password });
        if (error) throw new Error(error.message ?? "Sign in failed");
        toast.success("Signed in");
        navigate({ to: "/dashboard" });
      } else {
        const { error } = await authClient.signUp.email({
          email,
          password,
          name,
        });
        if (error) throw new Error(error.message ?? "Sign up failed");
        toast.success("Account created — you're signed in");
        navigate({ to: "/dashboard" });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setBusy(false);
    }
  };

  const handleGoogle = async () => {
    setBusy(true);
    try {
      await authClient.signIn.social({
        provider: "google",
        callbackURL: `${window.location.origin}/dashboard`,
      });
      // social sign-in redirects the browser; no further code runs here.
    } catch {
      toast.error("Google sign-in failed");
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left: brand + recap panel */}
      <div className="hidden lg:block w-1/2" aria-hidden />
      <div className="hidden lg:flex fixed inset-y-0 left-0 w-1/2 items-center justify-center bg-sidebar text-sidebar-foreground p-12 overflow-hidden">
        {/* Quiet ambient accent — kept to one corner, one signature move */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-32 -right-24 size-[420px] rounded-full opacity-20 blur-3xl"
          style={{ background: "radial-gradient(circle, var(--primary), transparent 70%)" }}
        />

        {/* Logo, text block, and footer now travel together as one centered group */}
        <div className="relative space-y-8 max-w-md">
          <img
            src={logoUrl}
            alt="MEDIANET NEXUS"
            className="h-9 w-auto object-contain"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />

          <div className="space-y-4">
            <h1 className="text-4xl font-semibold tracking-tight leading-tight">
              One workspace for every account, deal, and delivery.
            </h1>
            <p className="text-sm text-sidebar-muted leading-relaxed">
              MEDIANET Nexus brings customer success, sales, and project delivery into a single
              view — grounded in your data warehouse, refreshed on demand.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-x-6 gap-y-5">
            {MODULES.map(({ icon: Icon, label, blurb }) => (
              <div key={label} className="flex items-start gap-2.5">
                <div className="mt-0.5 size-7 shrink-0 rounded-md bg-sidebar-active grid place-items-center">
                  <Icon className="size-3.5 text-sidebar-foreground" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium leading-tight">{label}</p>
                  <p className="text-xs text-sidebar-muted leading-snug mt-0.5">{blurb}</p>
                </div>
              </div>
            ))}
          </div>

          <p className="text-xs text-sidebar-muted">
            Built for MEDIANET's Customer Success, Sales, and Delivery teams.
          </p>
        </div>
      </div>

      {/* Right: form — same surface as the left panel now, so the page reads as one continuous background */}
      <div className="flex-1 flex items-center justify-center px-6 py-12 bg-sidebar">
        <div className="w-full max-w-sm space-y-6">
          {/* Mobile-only brand mark, since the panel above is hidden below lg */}
          <div className="flex lg:hidden justify-center">
            <img
              src={logoUrl}
              alt="MEDIANET NEXUS"
              className="h-8 w-auto object-contain"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
          </div>

          {/* Cadre — rounded, bordered card holding the whole sign-in flow */}
          <div className="w-full rounded-2xl border border-border bg-card shadow-elevated p-8 space-y-8">
            <div className="space-y-2">
              <h2 className="text-2xl font-semibold tracking-tight">
                {mode === "signin" ? "Welcome back" : "Create your account"}
              </h2>
              <p className="text-sm text-muted-foreground">
                {mode === "signin"
                  ? "Sign in to access your Customer Success portal."
                  : "Get started with MEDIANET Nexus."}
              </p>
            </div>

            <Button
              type="button"
              variant="outline"
              className="w-full h-10"
              onClick={handleGoogle}
              disabled={busy}
            >
              <svg className="size-4 mr-2" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              Continue with Google
            </Button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-[10px] uppercase tracking-widest">
                <span className="bg-card px-2 text-muted-foreground">or</span>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === "signup" && (
                <div className="space-y-1.5">
                  <Label htmlFor="name">Full name</Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Elena Vance"
                    required
                  />
                </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@medianet.com"
                    className="pl-9"
                    required
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    minLength={6}
                    placeholder="••••••••"
                    className="pl-9"
                    required
                  />
                </div>
              </div>
              <Button type="submit" className="w-full h-10" disabled={busy}>
                {busy && <Loader2 className="size-4 mr-2 animate-spin" />}
                {busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
              </Button>
            </form>

            <p className="text-center text-sm text-muted-foreground">
              {mode === "signin" ? "New to Medianet?" : "Already have an account?"}{" "}
              <button
                type="button"
                onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
                className="text-primary font-medium hover:underline"
              >
                {mode === "signin" ? "Create an account" : "Sign in"}
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}