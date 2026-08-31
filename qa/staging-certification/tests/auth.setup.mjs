import path from "node:path";
import { fileURLToPath } from "node:url";

import { test } from "@playwright/test";

import { createAuthenticatedState, qaIdentity } from "../helpers/identity.mjs";

const directory = path.dirname(fileURLToPath(import.meta.url));
const authRoot = path.resolve(directory, "../artifacts/.auth");

const identities = [
  ["STAGING_QA_LEARNER_EMAIL", "learner.json"],
  ["STAGING_QA_FREE_LEARNER_EMAIL", "free-learner.json"],
  ["STAGING_QA_ONBOARDING_EMAIL", "onboarding.json"],
  ["STAGING_QA_ADMIN_EMAIL", "admin.json"],
  ["STAGING_QA_ANALYST_EMAIL", "analyst.json"],
  ["STAGING_QA_CONTENT_EDITOR_EMAIL", "content-editor.json"],
  ["STAGING_QA_CONTENT_REVIEWER_EMAIL", "content-reviewer.json"],
  ["STAGING_QA_PUBLISHER_EMAIL", "publisher.json"],
  ["STAGING_QA_PAYMENT_OPERATOR_EMAIL", "payment-operator.json"],
  ["STAGING_QA_LEARNER_SUPPORT_EMAIL", "learner-support.json"],
  ["STAGING_QA_SECURITY_ADMIN_EMAIL", "security-admin.json"],
  ["STAGING_QA_REVOKED_ADMIN_EMAIL", "revoked-admin.json"],
];

test("create all mandatory staging certification browser states", async () => {
  test.setTimeout(180_000);

  for (const [environmentName, filename] of identities) {
    await createAuthenticatedState(qaIdentity(environmentName), path.join(authRoot, filename));
  }
});
