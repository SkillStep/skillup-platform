import { readFileSync } from "node:fs";

const manifestUrl = new URL("../docs/product/course-expansion/certificate-policy-v1.proposal.json", import.meta.url);
const repoRoot = new URL("../", import.meta.url);

export const CANONICAL_SKILLS = Object.freeze([
  ["interview-workplace-communication", "Interview and Workplace Communication"],
  ["practical-english-study-work", "Practical English for Study and Work"],
  ["ai-tools-study-work", "AI Tools for Study and Work"],
  ["freelancing-foundations", "Freelancing Foundations"],
  ["digital-marketing-foundations", "Digital Marketing Foundations"],
  ["prompt-engineering-generative-ai", "Prompt Engineering & Generative AI"],
  ["cybersecurity-digital-safety", "Cybersecurity & Digital Safety"],
  ["data-analytics-dashboards", "Data Analytics & Decision Making"],
  ["applied-ai-workflows", "AI Automation & No-Code Tools"],
  ["sales-client-negotiation", "Sales, Negotiation & Client Management"],
]);

export const EXACT_DISCLAIMER =
  "SkillUp educational completion certificate — not an accredited professional qualification.";

export function readCertificatePolicyProposal() {
  return JSON.parse(readFileSync(manifestUrl, "utf8"));
}

export function validateCertificatePolicyProposal(policy) {
  const issues = [];
  const reject = (reason) => issues.push(reason);
  if (!policy || typeof policy !== "object") return ["Certificate policy must be an object."];
  if (
    policy.schemaVersion !== 1 ||
    policy.policyId !== "skillup-completion-certificate-policy" ||
    policy.policyVersion !== 1
  ) reject("Certificate policy identity/version mismatch.");
  if (
    policy.status !== "proposed_requires_product_owner_and_legal_approval" ||
    policy.effectiveAt !== null ||
    !policy.ownerApproval ||
    policy.ownerApproval.decision !== "pending" ||
    policy.ownerApproval.approvedBy !== null ||
    policy.ownerApproval.approvedAt !== null ||
    policy.ownerApproval.evidenceUrl !== null ||
    !policy.legalApproval ||
    policy.legalApproval.decision !== "pending" ||
    policy.legalApproval.approvedBy !== null ||
    policy.legalApproval.approvedAt !== null ||
    policy.legalApproval.evidenceUrl !== null
  ) reject("Do not fabricate product-owner or legal signoff. Policy must remain unapproved.");
  const activation = policy.releaseActivation || {};
  for (const [key, value] of Object.entries({
    enabled: false,
    publishCourses: false,
    issueCertificates: false,
    allowHistoricalBackfill: false,
    publicVerificationEnabled: false,
  })) {
    if (activation[key] !== value) reject(`Public activation is forbidden in this proposal: ${key}.`);
  }
  const scope = policy.scope || {};
  const skills = scope.canonicalSkills;
  if (
    scope.firstMilestoneSkills !== 10 ||
    scope.initiallyPublishedSkills !== 5 ||
    scope.additionalSkillsPendingPublication !== 5 ||
    !Array.isArray(skills) ||
    skills.length !== CANONICAL_SKILLS.length
  ) {
    reject("The exact 10-skill, 5-live + 5-pending cohort is mandatory.");
  } else {
    const uniqueSlugs = new Set();
    for (const [index, skill] of skills.entries()) {
      const [slug, title] = CANONICAL_SKILLS[index];
      if (
        skill?.skillSlug !== slug ||
        skill.displayName !== title ||
        skill.certificateTitle !== `Certificate of Completion — ${title}`
      ) reject(`Wrong immutable certificate name or canonical identity at skill ${index + 1}.`);
      if (uniqueSlugs.has(skill.skillSlug)) reject("Repeated skill slug.");
      uniqueSlugs.add(skill.skillSlug);
    }
  }
  const mastery = policy.mastery || {};
  if (
    mastery.minimumPassPercentPerLevel !== 80 ||
    mastery.coverageOfRequiredPublishedLevelVersionsPercent !== 100 ||
    mastery.requiredPublishedChallengeVersionsCorrectAtLeastOncePercent !== 100 ||
    mastery.noCredentialForMerelyViewingOrOpeningLesson !== true ||
    mastery.noRetroactiveCreditFromClientDisplayedProgress !== true
  ) reject("Mastery requires 80% every required level, 100% required versions and real server evidence.");
  const capstone = mastery.capstone || {};
  if (
    capstone.required !== true ||
    capstone.decision !== "passed" ||
    capstone.reviewerMustDifferFromLearner !== true ||
    capstone.reviewerRoleVerificationRequired !== true ||
    capstone.provisionalSelfScoreCannotAward !== true
  ) reject("Capstone requires real independent authorized human approval.");
  const exams = mastery.baselineAndEndline || {};
  if (
    exams.diagnosticBaselineMandatoryForAward !== false ||
    exams.finalKnowledgeAssessmentMandatoryForAward !== false ||
    exams.futureChangeRequiresNewApprovedRequirementVersion !== true
  ) reject("Draft baseline/endline items may not automatically qualify for v1 certificate awards.");
  const retakes = policy.retakes || {};
  if (
    retakes.allowed !== true ||
    retakes.attemptsPerChallengePerLevelSession !== 2 ||
    retakes.additionalLevelSessions !== "unlimited_without_daily_cooldown_under_existing_gameplay_service" ||
    retakes.persistAllAttempts !== true ||
    retakes.bestCompletedSessionCanSatisfyLevelScore !== true ||
    retakes.noScoreResetOrDeletionOfHistoricalAttempts !== true
  ) reject("Retake rules must align with actual two-attempt/restart gameplay semantics.");
  const eligibility = policy.eligibility || {};
  for (const key of [
    "isIndependentOfPlanAtMomentOfIssuance",
    "freeCanAccessOnlyExplicitlyApprovedFreePlayableContent",
    "premiumNeededForPremiumLockedContentWhenPlayed",
    "doNotBackfillOrBypassAccessControl",
    "mustBeActiveNonDeletedAccountToIssue",
    "oneCertificatePerLearnerSkillAndRequirementVersion",
    "concurrentReplaysReturnSameAward",
    "revokedAwardNeverAutomaticallyReissued",
    "newCourseVersionRequiresNewRequirementVersionAndSeparateEvidence",
    "historicalAwardsRemainAccessibleAfterExpiry",
    "historicalClaimsOnlyAfterExplicitApprovedEvidenceAudit",
    "noSeparateCertificateFee",
    "noAutomaticNewAwardFromCourseRevision",
  ]) if (eligibility[key] !== true) reject(`Missing entitlement/eligibility safeguard: ${key}.`);
  const legal = policy.legalPrivacy || {};
  if (
    legal.exactCertificateDisclaimer !== EXACT_DISCLAIMER ||
    legal.qualificationStatus !== "non_accredited_educational_completion_only" ||
    legal.marketingMustNotClaimIndependentQualification !== true ||
    !Array.isArray(legal.supportedLanguagesNow) ||
    legal.supportedLanguagesNow.join(",") !== "en"
  ) reject("Existing exact educational-only disclaimer and privacy limitations must not drift.");
  const privacy = legal.certificatePrivacy || {};
  if (
    privacy.ownerOnlyAuthenticatedPdf !== true ||
    privacy.publicVerification !== false ||
    privacy.publicIdentityLookup !== false ||
    privacy.shareableUnprotectedPdfRoute !== false ||
    privacy.exposeEmailAccountIdScoresAndAttemptHistory !== false
  ) reject("Private download and default-disabled public verification are mandatory.");
  const versioning = policy.versioning || {};
  for (const k of [
    "immutableFrozenApprovalDigest",
    "publishedOnlyEvidence",
    "supersededAndWithdrawnCannotNewlyQualify",
    "earnedAwardsRemainFrozenUnderTheirVersion",
    "noAutomaticMigrationOrBackfill",
    "samePolicyAllTen",
  ]) if (versioning[k] !== true) reject(`Missing immutable versioning safeguard: ${k}.`);
  if (!Array.isArray(policy.releaseConditions) || policy.releaseConditions.length < 6) {
    reject("Real owner/legal, capstone role, human content and exact-SHA QA gates must be documented.");
  }
  return issues;
}

export function validatePolicyRepositoryAlignment() {
  const errors = [];
  const read = (path) => readFileSync(new URL(path, repoRoot), "utf8");
  const api = read("apps/api/src/certificates.ts");
  const gameplay = read("apps/api/src/gameplay.ts");
  const bootstrap = read("apps/api/src/index.ts");
  const pdf = read("apps/api/src/certificate-pdf.ts");
  const smoke = read("tools/aifs-certificate-smoke.mjs");
  if (!api.includes("awarded_points * 100 >= max_points * $3"))
    errors.push("Current eligibility service no longer proves a per-level score threshold.");
  if (!api.includes("status = 'correct'") || !api.includes("challengeCount === challenges.length"))
    errors.push("Certificate eligibility no longer checks all mandatory correct challenges.");
  if (!api.includes("r.required_capstone") || !api.includes("capstonePassed"))
    errors.push("Certificate eligibility no longer requires an approved capstone.");
  if (
    !api.includes("roles.role = 'content_reviewer'") ||
    !api.includes("roles.created_at <= a.verified_at") ||
    !api.includes("reviewer_authorized")
  ) errors.push("Capstone reviewer role and at-attestation authorization guard is missing.");
  if (!gameplay.includes("challenge.max_attempts") && !gameplay.includes("challenge_version_id, max_attempts")) {
    // The actual service writes 2 attempts when starting each published level.
    if (!gameplay.includes("max_attempts") || !gameplay.includes("2,")) {
      errors.push("Game service no longer guarantees two attempts per question/session.");
    }
  }
  if (!bootstrap.includes('process.env["SKILLUP_CERTIFICATE_ISSUANCE_ENABLED"] === "yes"'))
    errors.push("Issuance feature flag has changed; update owner approval and operations.");
  if (!pdf.includes(EXACT_DISCLAIMER))
    errors.push("Certificate PDF no longer embeds the mandatory legal disclaimer.");
  if (!smoke.includes("issuanceEnabled: false") || !smoke.includes("await enabled.issue"))
    errors.push("Certificate smoke no longer tests the disabled issuance gate.");
  return errors;
}

if (process.argv[1]?.endsWith("validate-aifs-certificate-policy.mjs")) {
  const errors = [
    ...validateCertificatePolicyProposal(readCertificatePolicyProposal()),
    ...validatePolicyRepositoryAlignment(),
  ];
  if (errors.length) {
    for (const error of errors) console.error(`CERTIFICATE POLICY ERROR: ${error}`);
    process.exitCode = 1;
  } else {
    console.info(
      "Certificate policy v1 proposal verified: 10 exact titles; 80% per level; all required challenges; two tries; capstone; unchanged disclaimer; issuance OFF; approval PENDING.",
    );
  }
}
