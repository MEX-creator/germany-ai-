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
  });

const globalForPrisma = globalThis as unknown as {
  prisma: any | undefined;
};

export const db = globalForPrisma.prisma ?? createPrismaClient();

globalForPrisma.prisma = db;
