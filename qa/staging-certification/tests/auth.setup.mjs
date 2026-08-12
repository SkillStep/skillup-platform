import path from "node:path";
import { fileURLToPath } from "node:url";

import { test } from "@playwright/test";

import { createAuthenticatedState, qaIdentity } from "../helpers/identity.mjs";

const directory = path.dirname(fileURLToPath(import.meta.url));
const authRoot = path.resolve(directory, "../artifacts/.auth");

test("create learner, admin and analyst browser states", async () => {
  await createAuthenticatedState(
    qaIdentity("STAGING_QA_LEARNER_EMAIL"),
    path.join(authRoot, "learner.json"),
  );
  await createAuthenticatedState(
    qaIdentity("STAGING_QA_ADMIN_EMAIL"),
    path.join(authRoot, "admin.json"),
  );
  await createAuthenticatedState(
    qaIdentity("STAGING_QA_ANALYST_EMAIL"),
    path.join(authRoot, "analyst.json"),
  );
});
