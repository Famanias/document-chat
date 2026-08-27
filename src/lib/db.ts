import "server-only";

import { neon } from "@neondatabase/serverless";

import { requireServerEnv } from "@/lib/env";

let database: ReturnType<typeof neon> | undefined;

export function db() {
  database ??= neon(requireServerEnv("DATABASE_URL"));
  return database;
}
