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
          const { profiles } = await import("./db/schema");

          await db.insert(profiles).values({
            id: createdUser.id,
            displayName: createdUser.name ?? null,
            avatarUrl: createdUser.image ?? null,
          });
        },
      },
    },
  },

  trustedOrigins: [
  "http://localhost:5173",
  "http://localhost:3000",
  ...(process.env.APP_URL ? [process.env.APP_URL] : []),
],
});