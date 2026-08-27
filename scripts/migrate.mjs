import nextEnv from "@next/env";
import { neon } from "@neondatabase/serverless";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";

const { loadEnvConfig } = nextEnv;

loadEnvConfig(process.cwd());

const databaseUrl = process.env.DATABASE_URL?.replace(/^\uFEFF/, "").trim();

if (!databaseUrl) {
  console.error("DATABASE_URL is required. Copy .env.example to .env.local and add your Neon connection string.");
  process.exit(1);
}

const sql = neon(databaseUrl);
const migrationsDirectory = resolve(process.cwd(), "migrations");
const migrationFiles = (await readdir(migrationsDirectory))
  .filter((filename) => filename.endsWith(".sql"))
  .sort();

for (const filename of migrationFiles) {
  const migration = await readFile(resolve(migrationsDirectory, filename), "utf8");
  const statements = migration
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean);

  await sql.transaction(statements.map((statement) => sql.query(statement)));
  console.log(`Applied ${filename}.`);
}
console.log("Database migration completed.");
