import { createServerFn } from "@tanstack/react-start";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { db } from "./db";
import { profiles, userRoles, user } from "./db/schema";
import { auth } from "./auth";
import { getRequest } from "@tanstack/react-start/server";
import { randomUUID } from "crypto";
import { type AppRole, ROLE_LABELS } from "./roles";

const roleValues = Object.keys(ROLE_LABELS) as [AppRole, ...AppRole[]];

const roleAssignmentSchema = z.object({
  userId: z.string(),
  role: z.enum(roleValues),
});

async function requireUserId(): Promise<string> {
  const { headers } = getRequest();
  const session = await auth.api.getSession({ headers });
  if (!session?.user) throw new Error("Not authenticated");
  return session.user.id;
}

async function requireAdmin(): Promise<string> {
  const userId = await requireUserId();
  const callerRoles = await db.query.userRoles.findMany({ where: eq(userRoles.userId, userId) });
  if (!callerRoles.some((r) => r.role === "superadmin" || r.role === "it_specialist")) {
    throw new Error("Forbidden");
  }
  return userId;
}

// Fetches the current user's profile + roles.
// Replaces the two supabase.from(...) calls in use-auth.tsx's loadUserData.
export const getCurrentUserData = createServerFn({ method: "GET" }).handler(async () => {
  const userId = await requireUserId();

  const [profile, roleRows] = await Promise.all([
    db.query.profiles.findFirst({ where: eq(profiles.id, userId) }),
    db.query.userRoles.findMany({ where: eq(userRoles.userId, userId) }),
  ]);

  return {
    profile: profile ?? null,
    roles: roleRows.map((r) => r.role) as AppRole[],
  };
});

// Replaces the admin.tsx supabase.from("profiles") / supabase.from("user_roles") queries.
export const getAllUsersWithRoles = createServerFn({ method: "GET" }).handler(async () => {
  await requireAdmin();

  const allProfiles = await db.select().from(profiles);
  const allRoles = await db.select().from(userRoles);

  const byUser = new Map<string, AppRole[]>();
  for (const r of allRoles) {
    const list = byUser.get(r.userId) ?? [];
    list.push(r.role as AppRole);
    byUser.set(r.userId, list);
  }

  return allProfiles.map((p) => ({
    user_id: p.id,
    display_name: p.displayName,
    roles: byUser.get(p.id) ?? [],
  }));
});

// Assigns a role to a user. Only callable by admins.
// Writes `userName` denormalized for readability in pgAdmin.
export const assignRole = createServerFn({ method: "POST" })
  .inputValidator(roleAssignmentSchema)
  .handler(async ({ data }) => {
    await requireAdmin();

    const existing = await db.query.userRoles.findFirst({
      where: and(eq(userRoles.userId, data.userId), eq(userRoles.role, data.role)),
    });
    if (existing) return { ok: true };

    const targetUser = await db.query.user.findFirst({ where: eq(user.id, data.userId) });

    await db.insert(userRoles).values({
      id: randomUUID(),
      userId: data.userId,
      userName: targetUser?.name ?? null,
      role: data.role,
    });

    return { ok: true };
  });

// Revokes a role from a user. Only callable by admins.
export const revokeRole = createServerFn({ method: "POST" })
  .inputValidator(roleAssignmentSchema)
  .handler(async ({ data }) => {
    await requireAdmin();

    await db
      .delete(userRoles)
      .where(and(eq(userRoles.userId, data.userId), eq(userRoles.role, data.role)));

    return { ok: true };
  });