import { setTimeout as delay } from "node:timers/promises";

import { createDatabaseClient, requireDatabaseUrl } from "../index.js";

const attempts = 30;
const delayMilliseconds = 1_000;
let lastError: unknown;

for (let attempt = 1; attempt <= attempts; attempt += 1) {
  const client = createDatabaseClient({
    connectionString: requireDatabaseUrl(),
    applicationName: "skillup-db-wait",
    maxConnections: 1,
  });

  try {
    if (await client.ping()) {
      console.log(`PostgreSQL became ready on attempt ${attempt}.`);
      await client.close();
      process.exit(0);
    }
  } catch (error) {
    lastError = error;
  } finally {
    await client.close().catch(() => undefined);
  }

  if (attempt < attempts) await delay(delayMilliseconds);
}

console.error("PostgreSQL did not become ready within 30 seconds.", lastError);
process.exit(1);
