import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { authClient, useSession } from "@/lib/auth-client";
import { getCurrentUserData } from "@/lib/user-data";
import type { AppRole } from "@/lib/roles";

type Profile = {
  id: string;
  displayName: string | null;
  avatarUrl: string | null;
};

type SessionUser = {
  id: string;
  email: string;
  name: string;
};

type AuthContextValue = {
  loading: boolean;
  session: { user: SessionUser } | null;
  user: SessionUser | null;
  profile: Profile | null;
  roles: AppRole[];
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { data: sessionData, isPending } = useSession();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  const loadUserData = async () => {
    try {
      const result = await getCurrentUserData();
      setProfile(
        result.profile
          ? {
              id: result.profile.id,
              displayName: result.profile.displayName,
              avatarUrl: result.profile.avatarUrl,
            }
          : null,
      );
      setRoles(result.roles);
    } catch {
      setProfile(null);
      setRoles([]);
    } finally {
      setDataLoading(false);
    }
  };

  useEffect(() => {
    if (isPending) return;
    if (sessionData?.user) {
      void loadUserData();
    } else {
      setProfile(null);
      setRoles([]);
      setDataLoading(false);
    }
  }, [isPending, sessionData?.user?.id]);

  const value = useMemo<AuthContextValue>(
    () => ({
      loading: isPending || dataLoading,
      session: sessionData?.user
        ? {
            user: {
              id: sessionData.user.id,
              email: sessionData.user.email,
              name: sessionData.user.name,
            },
          }
        : null,
      user: sessionData?.user
        ? { id: sessionData.user.id, email: sessionData.user.email, name: sessionData.user.name }
        : null,
      profile,
      roles,
      signOut: async () => {
        await authClient.signOut();
      },
      refresh: async () => {
        if (sessionData?.user) await loadUserData();
      },
    }),
    [isPending, dataLoading, sessionData, profile, roles],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}