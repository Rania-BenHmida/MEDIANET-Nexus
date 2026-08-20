import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "./db";
import { user, session, account, verification } from "./db/schema";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: { user, session, account, verification },
  }),

  emailAndPassword: {
    enabled: true,
  },

  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
    },
  },

  // Runs once a new user record is created (email/password OR OAuth).
  // Mirrors the old Supabase trigger that created a `profiles` row.
  // NOTE: no role is assigned by default — new users have zero roles
  // and will be redirected to /unauthorized until an admin assigns one
  // via the admin page.
  databaseHooks: {
    user: {
      create: {
        after: async (createdUser) => {
          const { db } = await import("./db");
          const { profiles, userRoles, user } = await import("./db/schema");

          await db.insert(profiles).values({
            id: createdUser.id,
            displayName: createdUser.name ?? null,
            avatarUrl: createdUser.image ?? null,
          });

          // Best-effort: tell everyone who can act on it — it_specialist AND
          // superadmin, same pairing as SECTION_ACCESS.roles in roles.ts —
          // that a new account is waiting on a role. Wrapped so a
          // Django/SMTP hiccup never blocks signup — the account is already
          // created above regardless of this.
          try {
            const { inArray } = await import("drizzle-orm");
            const specialistRoleRows = await db
              .select({ userId: userRoles.userId })
              .from(userRoles)
              .where(inArray(userRoles.role, ["it_specialist", "superadmin"]));

            if (specialistRoleRows.length > 0) {
              const specialistIds = specialistRoleRows.map((r) => r.userId);
              const specialists = await db
                .select({ email: user.email })
                .from(user)
                .where(inArray(user.id, specialistIds));
              const recipients = specialists.map((s) => s.email).filter(Boolean);

              if (recipients.length > 0) {
                const { sendAccountEmail } = await import("./api/accounts");
                await sendAccountEmail({
                  event: "new_signup",
                  recipients,
                  context: { name: createdUser.name ?? "New user", email: createdUser.email },
                });
              }
            }
          } catch (err) {
            console.warn("[auth] Failed to notify IT specialists of new signup:", err);
          }
        },
      },
    },
  },

  trustedOrigins: [
  "http://localhost:5173",
  "http://localhost:3000",
  "http://medianet-nexus.local:5173",
  "https://medianet-nexus.local:5173",
  ...(process.env.APP_URL ? [process.env.APP_URL] : []),
],
});