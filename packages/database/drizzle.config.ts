import { defineConfig } from "drizzle-kit";

const localDatabaseUrl = "postgresql://skillup_local:skillup_local_only@127.0.0.1:5432/skillup";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env["DATABASE_URL"] ?? localDatabaseUrl,
  },
  strict: true,
  verbose: true,
});
