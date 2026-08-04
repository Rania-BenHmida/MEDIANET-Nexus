import { pgTable, text, timestamp, boolean, pgEnum } from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// better-auth core tables (names/shapes follow better-auth's expected schema)
// ---------------------------------------------------------------------------

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  idToken: text("id_token"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ---------------------------------------------------------------------------
// App-specific tables (replace Supabase `profiles` + `user_roles`)
// ---------------------------------------------------------------------------

export const profiles = pgTable("profiles", {
  // 1:1 with `user.id`
  id: text("id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  displayName: text("display_name"),
  avatarUrl: text("avatar_url"),
});

export const appRoleEnum = pgEnum("app_role", [
  "admin",
  "superadmin",
  "it_specialist",
  "executive",
  "commercial",
  "customer_success",
  "project_manager",
]);

export const userRoles = pgTable("user_roles", {
  id: text("id").primaryKey(), // generate with crypto.randomUUID() on insert
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  // Denormalized copy of the user's name, for readability when browsing
  // this table directly (e.g. in pgAdmin). Not the source of truth —
  // keep in sync with `user.name` / `profiles.displayName` on changes.
  userName: text("user_name"),
  role: appRoleEnum("role").notNull(),
});