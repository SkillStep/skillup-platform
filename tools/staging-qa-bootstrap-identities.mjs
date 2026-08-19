import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  createAuthenticatedState,
  qaIdentity,
} from "../qa/staging-certification/helpers/identity.mjs";

const identities = [
  "STAGING_QA_LEARNER_EMAIL",
  "STAGING_QA_FREE_LEARNER_EMAIL",
  "STAGING_QA_ONBOARDING_EMAIL",
  "STAGING_QA_ADMIN_EMAIL",
  "STAGING_QA_ANALYST_EMAIL",
  "STAGING_QA_CONTENT_EDITOR_EMAIL",
  "STAGING_QA_CONTENT_REVIEWER_EMAIL",
  "STAGING_QA_PUBLISHER_EMAIL",
  "STAGING_QA_PAYMENT_OPERATOR_EMAIL",
  "STAGING_QA_LEARNER_SUPPORT_EMAIL",
  "STAGING_QA_SECURITY_ADMIN_EMAIL",
  "STAGING_QA_REVOKED_ADMIN_EMAIL",
];

const stateRoot = await fs.mkdtemp(path.join(os.tmpdir(), "skillup-staging-qa-bootstrap-"));

try {
  for (const environmentName of identities) {
    const email = qaIdentity(environmentName);
    await createAuthenticatedState(email, path.join(stateRoot, `${environmentName}.json`));
    console.log(`${environmentName} verified through the real staging OTP flow.`);
  }
} finally {
  await fs.rm(stateRoot, { recursive: true, force: true });
}

console.log("All mandatory staging QA accounts are verified and available for fixture provisioning.");
