import assert from "node:assert/strict";
import test from "node:test";

import {
  EXACT_DISCLAIMER,
  CANONICAL_SKILLS,
  readCertificatePolicyProposal,
  validateCertificatePolicyProposal,
  validatePolicyRepositoryAlignment,
} from "./validate-aifs-certificate-policy.mjs";

const approvedDraft = readCertificatePolicyProposal();

test("v1 owner decision proposal has exactly ten immutable certificate names and no launch side effects", () => {
  assert.deepEqual(validateCertificatePolicyProposal(approvedDraft), []);
  assert.equal(CANONICAL_SKILLS.length, 10);
  assert.equal(approvedDraft.scope.canonicalSkills.length, 10);
  assert.equal(approvedDraft.releaseActivation.enabled, false);
  assert.equal(approvedDraft.releaseActivation.issueCertificates, false);
  assert.equal(approvedDraft.ownerApproval.decision, "pending");
  assert.equal(approvedDraft.legalApproval.decision, "pending");
});

test("rejects fabricated legal/product approval and accidental active certificate switches", () => {
  const changed = structuredClone(approvedDraft);
  changed.ownerApproval.approvedBy = "ai-agent";
  changed.ownerApproval.decision = "approved";
  changed.legalApproval.approvedAt = new Date().toISOString();
  changed.releaseActivation.issueCertificates = true;
  const errors = validateCertificatePolicyProposal(changed).join(" ");
  assert.match(errors, /fabricate product-owner or legal signoff/);
  assert.match(errors, /Public activation is forbidden/);
});

test("rejects weaker scores, missing mandatory challenge mastery or weakened capstone checks", () => {
  const changed = structuredClone(approvedDraft);
  changed.mastery.minimumPassPercentPerLevel = 60;
  changed.mastery.requiredPublishedChallengeVersionsCorrectAtLeastOncePercent = 80;
  changed.mastery.capstone.reviewerRoleVerificationRequired = false;
  const errors = validateCertificatePolicyProposal(changed).join(" ");
  assert.match(errors, /80% every required level/);
  assert.match(errors, /authorized human approval/);
});

test("retake contract matches existing gameplay and does not erase learner evidence", () => {
  const changed = structuredClone(approvedDraft);
  changed.retakes.attemptsPerChallengePerLevelSession = 5;
  changed.retakes.persistAllAttempts = false;
  const errors = validateCertificatePolicyProposal(changed).join(" ");
  assert.match(errors, /two-attempt/);
});

test("unapproved baseline exams cannot silently qualify as certificate evidence", () => {
  const changed = structuredClone(approvedDraft);
  changed.mastery.baselineAndEndline.finalKnowledgeAssessmentMandatoryForAward = true;
  assert.match(validateCertificatePolicyProposal(changed).join(" "), /Draft baseline\/endline/);
});

test("does not permit misleading titles, public verification or extra certificate fees", () => {
  const changed = structuredClone(approvedDraft);
  changed.scope.canonicalSkills[6].certificateTitle = "Accredited Cybersecurity Professional";
  changed.legalPrivacy.certificatePrivacy.publicVerification = true;
  changed.eligibility.noSeparateCertificateFee = false;
  const errors = validateCertificatePolicyProposal(changed).join(" ");
  assert.match(errors, /immutable certificate name/);
  assert.match(errors, /Private download/);
  assert.match(errors, /Missing entitlement\/eligibility safeguard/);
});

test("exact already-implemented disclaimer remains unchanged across spec and certificate renderer", () => {
  assert.equal(
    EXACT_DISCLAIMER,
    "SkillUp educational completion certificate — not an accredited professional qualification.",
  );
  assert.equal(approvedDraft.legalPrivacy.exactCertificateDisclaimer, EXACT_DISCLAIMER);
  assert.deepEqual(validatePolicyRepositoryAlignment(), []);
});
