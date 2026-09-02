import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  /**
   * Server-side environment variables schema.
   */
  server: {
    DATABASE_URL: z.string().url().or(z.string().startsWith("postgresql://")),
    NVIDIA_API_KEY: z.string().min(1),
    PASSCODE: z.string().optional(),
    NODE_ENV: z.enum(["development", "production", "test"]),
  },

  /**
   * Client-side environment variables schema.
   */
  client: {},

  /**
   * You can't destruct `process.env` as a regular object in the Next.js edge runtimes.
   */
  runtimeEnv: {
    DATABASE_URL: process.env.DATABASE_URL,
    NVIDIA_API_KEY: process.env.NVIDIA_API_KEY,
    PASSCODE: process.env.PASSCODE,
    NODE_ENV: process.env.NODE_ENV,
  },

  /**
   * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation.
   */
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,

  /**
   * Makes it so that empty strings are treated as undefined.
   */
  emptyStringAsUndefined: true,
});
