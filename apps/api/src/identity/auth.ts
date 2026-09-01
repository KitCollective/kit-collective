import { account, type Db, session, user, verification } from "@kit/db";
import bcrypt from "bcryptjs";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { bearer } from "better-auth/plugins";
import { requireBetterAuthSecret, requireBetterAuthUrl } from "../config/better-auth-env.js";

const { hash, compare } = bcrypt;

export function createAuth(db: Db) {
  return betterAuth({
    secret: requireBetterAuthSecret(),
    baseURL: requireBetterAuthUrl(),
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: {
        user,
        session,
        account,
        verification,
      },
    }),
    emailAndPassword: {
      enabled: true,
      password: {
        hash: async (password: string) => hash(password, 12),
        verify: async ({ hash: hashed, password }: { hash: string; password: string }) =>
          compare(password, hashed),
      },
    },
    plugins: [bearer()],
    user: {
      additionalFields: {
        role: {
          type: "string",
          defaultValue: "user",
          input: false,
        },
        handle: {
          type: "string",
          required: true,
        },
      },
    },
  });
}

export type AuthInstance = ReturnType<typeof createAuth>;

export const AUTH = Symbol("AUTH");
