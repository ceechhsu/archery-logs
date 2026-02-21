import { z } from "zod";

const envSchema = z.object({
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  GOOGLE_OAUTH_REDIRECT_URI: z.string().url(),
  APP_SESSION_SECRET: z.string().min(32),
  SENTRY_DSN: z.string().optional()
});

export function serverEnv() {
  return envSchema.parse(process.env);
}
