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

const deleteUserSchema = z.object({
  userId: z.string(),
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
//
// IMPORTANT: this must stay a POST, not GET. Browsers can cache GET
// responses by URL alone, ignoring the session cookie — so after one
// account's roles got cached, a *different* account logging in at the same
// URL would silently receive the previous account's cached roles instead
// of a fresh request. POST is never browser-cached, so every call is real.
export const getCurrentUserData = createServerFn({ method: "POST" }).handler(async () => {
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
// Now also pulls email + createdAt from the `user` table (Better Auth's own table) so the
// Roles page can show contact info and tell genuinely-new signups apart from old accounts
// that just never got a role.
//
// Same GET-caching hazard as getCurrentUserData above — kept as POST so the
// Roles page always reflects the real current state, never a stale cache.
export const getAllUsersWithRoles = createServerFn({ method: "POST" }).handler(async () => {
  await requireAdmin();

  const allProfiles = await db.select().from(profiles);
  const allRoles = await db.select().from(userRoles);
  const allUsers = await db
    .select({ id: user.id, email: user.email, createdAt: user.createdAt })
    .from(user);

  const byUser = new Map<string, AppRole[]>();
  for (const r of allRoles) {
    const list = byUser.get(r.userId) ?? [];
    list.push(r.role as AppRole);
    byUser.set(r.userId, list);
  }

  const userInfoById = new Map(allUsers.map((u) => [u.id, u]));

  return allProfiles.map((p) => {
    const info = userInfoById.get(p.id);
    return {
      user_id: p.id,
      display_name: p.displayName,
      email: info?.email ?? null,
      created_at: info?.createdAt ? info.createdAt.toISOString() : null,
      roles: byUser.get(p.id) ?? [],
    };
  });
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

    // Best-effort: let the new joiner know their access is ready. Never
    // blocks the assignment — the role is already granted above either way.
    if (targetUser?.email) {
      try {
        const { sendAccountEmail } = await import("./api/accounts");
        await sendAccountEmail({
          event: "role_assigned",
          recipients: [targetUser.email],
          context: { name: targetUser.name ?? "there", role_label: ROLE_LABELS[data.role] },
        });
      } catch (err) {
        console.warn("[user-data] Failed to notify user of role assignment:", err);
      }
    }

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

// Permanently deletes a user account — for cleaning up test signups.
// The `user` row is the root of the FK chain (session, account, profiles,
// user_roles all declare onDelete: "cascade" against it in schema.ts), so
// one delete here removes everything: login, profile, and every role.
//
// Blocked for superadmin accounts, full stop, regardless of who's calling
// this — there's no UI path to re-bootstrap a superadmin once the last one
// is gone, so this is the one hard guardrail rather than a soft warning.
export const deleteUser = createServerFn({ method: "POST" })
  .inputValidator(deleteUserSchema)
  .handler(async ({ data }) => {
    await requireAdmin();

    const targetRoles = await db.query.userRoles.findMany({ where: eq(userRoles.userId, data.userId) });
    if (targetRoles.some((r) => r.role === "superadmin")) {
      throw new Error("Superadmin accounts can't be deleted.");
    }

    await db.delete(user).where(eq(user.id, data.userId));

    return { ok: true };
  });