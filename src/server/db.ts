import { PrismaClient } from "@prisma/client";

import { env } from "@/env";

// Define the environment type
type Environment = {
  NODE_ENV: "development" | "production" | "test";
};

const createPrismaClient = () =>
  new PrismaClient({
    log:
      (env as Environment).NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
    // Limit pool to 2 connections per instance to avoid exhausting
    // Supabase free tier (15 max). With multiple Vercel instances,
    // 2 per instance keeps total well under 15.
    __internal: {
      engine: {
        pool: {
          min: 0,
          max: 2,
        },
      },
    },
  } as any);

const globalForPrisma = globalThis as unknown as {
  prisma: any | undefined;
};

export const db = globalForPrisma.prisma ?? createPrismaClient();

globalForPrisma.prisma = db;
