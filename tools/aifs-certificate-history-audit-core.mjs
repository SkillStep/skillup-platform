/**
 * Historical certificate audit. All queries are read-only and aggregate results
 * contain no user identifiers. Never infer awards from UI progress or issue one.
 *
 * A candidate is someone with at least one completed session for a required
 * published level. A legacy progress-only record is reported separately; it
 * is not valid credential evidence. Any sampling/truncation blocks certification.
 */
export const HISTORY_DEFAULT_LIMIT = 5_000;
export const HISTORY_PAGE_SIZE = 200;

export function historyLimit(value = "") {
  if (!value) return HISTORY_DEFAULT_LIMIT;
  if (!/^[0-9]+$/.test(value)) throw new Error("History audit limit must be an integer.");
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 100_000) {
    throw new Error("History audit limit must be between 1 and 100000.");
  }
  return parsed;
}

export async function auditCertificateHistory(client, service, { limit = HISTORY_DEFAULT_LIMIT } = {}) {
  const policies = await client.query(
    `select s.slug, r.id, r.level_version_ids
       from skill_completion_requirement_sets r
       join skills s on s.id = r.skill_id and s.status = 'published'
       join skill_versions sv on sv.id = r.skill_version_id
         and sv.skill_id = r.skill_id and sv.status = 'published'
         and sv.reviewed_at is not null and sv.published_at is not null
      where r.status = 'active' and r.approved_by is not null
        and r.approved_at is not null and r.minimum_pass_percent is not null
        and r.retries_allowed is not null
      order by s.slug`,
  );

  const totals = [];
  let coverageComplete = true;
  for (const policy of policies.rows) {
    // Scope each scan to a pinned, approved requirement set; no arbitrary
    // global user query and no identifiable data in the report.
    const counts = await client.query(
      `select
        (select count(distinct sessions.user_id)::int
           from level_play_sessions sessions
           join users u on u.id = sessions.user_id and u.status = 'active'
          where sessions.level_version_id = any($1::uuid[])
            and sessions.state = 'completed') as candidate_count,
        (select count(distinct progress.user_id)::int
           from learner_level_progress progress
           join users u on u.id = progress.user_id and u.status = 'active'
          where progress.level_version_id = any($1::uuid[])
            and progress.completion_count > 0
            and not exists (
              select 1 from level_play_sessions sessions
               where sessions.user_id = progress.user_id
                 and sessions.level_version_id = any($1::uuid[])
                 and sessions.state = 'completed'
            )) as progress_only_count`,
      [policy.level_version_ids],
    );
    const total = Number(counts.rows[0]?.candidate_count ?? 0);
    const progressOnly = Number(counts.rows[0]?.progress_only_count ?? 0);
    let examined = 0;
    let cursor = null;
    const results = { eligible: 0, earned: 0, incomplete: 0, unavailable: 0 };
    while (examined < Math.min(total, limit)) {
      const page = await client.query(
        `select distinct sessions.user_id
           from level_play_sessions sessions
           join users u on u.id = sessions.user_id and u.status = 'active'
          where sessions.level_version_id = any($1::uuid[])
            and sessions.state = 'completed'
            and ($2::uuid is null or sessions.user_id > $2::uuid)
          order by sessions.user_id
          limit $3`,
        [policy.level_version_ids, cursor, Math.min(HISTORY_PAGE_SIZE, limit - examined)],
      );
      if (!page.rows.length) break;
      for (const row of page.rows) {
        const eligibility = await service.eligibility(row.user_id, policy.slug);
        if (!(eligibility.status in results)) throw new Error("Unexpected certificate eligibility status.");
        results[eligibility.status]++;
      }
      examined += page.rows.length;
      cursor = page.rows[page.rows.length - 1].user_id;
    }
    const truncated = examined !== total;
    if (truncated) coverageComplete = false;
    totals.push({
      skillSlug: policy.slug,
      candidateCountTotal: total,
      examinedCandidates: examined,
      eligibleButNotIssued: results.eligible,
      alreadyIssued: results.earned,
      incomplete: results.incomplete,
      unavailable: results.unavailable,
      legacyProgressOnly: progressOnly,
      candidateLimitHit: truncated,
      fullCoverageProven: !truncated,
    });
  }

  const awards = await client.query(
    `select
        count(*)::int as total_awards,
        count(*) filter (where a.revoked_at is null)::int as issued_awards,
        count(*) filter (where a.revoked_at is not null)::int as revoked_awards,
        count(*) filter (where r.status <> 'active')::int as awards_from_prior_requirement_versions,
        count(*) filter (
          where a.evidence_digest !~ '^[a-f0-9]{64}$'
            or a.issued_at < a.completed_at
            or a.skill_id <> r.skill_id
            or a.certificate_title <> 'Certificate of Completion — ' || sv.title
            or (a.revoked_at is not null and (a.revocation_reason is null or a.revoked_by is null))
            or not exists (
              select 1 from skill_certificate_events e
               where e.award_id = a.id and e.action = 'issued'
            )
        )::int as frozen_evidence_anomalies
       from skill_certificate_awards a
       join skill_completion_requirement_sets r on r.id = a.requirement_set_id
       join skill_versions sv on sv.id = r.skill_version_id`,
  );
  const frozenAwards = awards.rows[0];
  const anomalies = Number(frozenAwards?.frozen_evidence_anomalies ?? 0);
  return {
    schemaVersion: "skillup-certificate-history-audit-v2",
    mode: "READ_ONLY_NO_AWARDS",
    policyCount: policies.rows.length,
    totalCandidates: totals.reduce((n, item) => n + item.candidateCountTotal, 0),
    examinedCandidates: totals.reduce((n, item) => n + item.examinedCandidates, 0),
    candidateLimitPerSkill: limit,
    fullCoverageProven: coverageComplete,
    frozenAwardEvidenceAnomalies: anomalies,
    frozenAwards: {
      total: Number(frozenAwards?.total_awards ?? 0),
      issued: Number(frozenAwards?.issued_awards ?? 0),
      revoked: Number(frozenAwards?.revoked_awards ?? 0),
      fromPriorRequirementVersions: Number(frozenAwards?.awards_from_prior_requirement_versions ?? 0),
    },
    results: totals,
    certificationStatus: !coverageComplete || anomalies > 0
      ? "REVIEW_REQUIRED"
      : policies.rows.length === 0
        ? "NO_ACTIVE_POLICY_CANNOT_CERTIFY"
        : "AUDITED_NO_WRITES",
    note: "No user identifiers, names, phone numbers, emails, private answer keys or award IDs returned. No backfill or award issuance. Progress-only history is not credential evidence. Archived/revoked awards require independent legal/product review.",
  };
}
