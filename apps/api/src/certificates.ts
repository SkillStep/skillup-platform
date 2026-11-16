import { createHash, randomBytes } from "node:crypto";

import type { DatabaseClient } from "@skillup/database";
import type { FastifyInstance } from "fastify";
import type { PoolClient } from "pg";
import { z } from "zod";

import type { AuthService, AuthenticatedLearner } from "./auth.js";
import type { ApiConfig } from "./config.js";
import { requireAuthenticatedLearner, requireTrustedRequestOrigin } from "./request-auth.js";

export class CertificateError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "CertificateError";
  }
}

type Requirements = Readonly<{
  id: string;
  skill_id: string;
  skill_version_id: string;
  skill_slug: string;
  requirement_version: number;
  level_version_ids: string[];
  challenge_version_ids: string[];
  content_digest: string;
  minimum_pass_percent: number;
  required_capstone: boolean;
  retries_allowed: boolean;
  skill_title: string;
}>;

export type CertificateSummary = Readonly<{
  id: string;
  publicId: string;
  title: string;
  completedAt: string;
  issuedAt: string;
  status: "issued" | "revoked";
}>;

export type CertificateEligibility = Readonly<{
  status: "unavailable" | "incomplete" | "eligible" | "earned";
  requiredLevels: number;
  completedLevels: number;
  requiredChallenges: number;
  passedChallenges: number;
  capstoneRequired: boolean;
  capstonePassed: boolean;
}>;

export type CertificateService = Readonly<{
  list: (userId: string) => Promise<readonly CertificateSummary[]>;
  eligibility: (userId: string, skillSlug: string) => Promise<CertificateEligibility>;
  issue: (learner: AuthenticatedLearner, skillSlug: string) => Promise<CertificateSummary>;
}>;

const uuid = z.string().uuid();
const slug = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .max(120);

function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

async function policy(
  db: Pick<PoolClient, "query">,
  skillSlug: string,
): Promise<Requirements | null> {
  const result = await db.query<Requirements>(
    `select r.*, s.slug as skill_slug, sv.title as skill_title
       from skill_completion_requirement_sets r
       join skills s on s.id = r.skill_id and s.status = 'published'
       join skill_versions sv on sv.id = r.skill_version_id
         and sv.skill_id = r.skill_id and sv.status = 'published'
         and sv.reviewed_at is not null and sv.published_at is not null
      where s.slug = $1 and r.status = 'active' and r.approved_by is not null
        and r.approved_at is not null and r.minimum_pass_percent is not null
        and r.retries_allowed is not null
      limit 1`,
    [skillSlug],
  );
  return result.rows[0] ?? null;
}

async function verifiedEvidence(
  db: Pick<PoolClient, "query">,
  userId: string,
  r: Requirements,
): Promise<CertificateEligibility & { completedAt: Date | null; evidenceHash: string }> {
  const levels = [...new Set(r.level_version_ids)];
  const challenges = [...new Set(r.challenge_version_ids)];
  const blank = {
    status: "incomplete" as const,
    requiredLevels: levels.length,
    completedLevels: 0,
    requiredChallenges: challenges.length,
    passedChallenges: 0,
    capstoneRequired: r.required_capstone,
    capstonePassed: false,
    completedAt: null,
    evidenceHash: "",
  };
  if (
    !levels.length ||
    !challenges.length ||
    levels.length !== r.level_version_ids.length ||
    challenges.length !== r.challenge_version_ids.length
  ) {
    return blank;
  }

  // Do not permit a policy which silently omits any of the current published
  // challenges of its required levels. Draft, archived and altered versions fail.
  const publication = await db.query<{
    published_levels: number;
    published_challenges: number;
    published_challenges_within_levels: number;
    all_required_challenges: number;
  }>(
    `select
       (select count(*)::int from level_versions v
        where v.id = any($1::uuid[]) and v.state = 'published') as published_levels,
       (select count(*)::int from challenge_versions c
        where c.id = any($2::uuid[]) and c.state = 'published') as published_challenges,
       (select count(*)::int from challenge_versions c
        where c.id = any($2::uuid[]) and c.level_version_id = any($1::uuid[])
          and c.state = 'published') as published_challenges_within_levels,
       (select count(*)::int from challenge_versions c
        where c.level_version_id = any($1::uuid[]) and c.state = 'published') as all_required_challenges`,
    [levels, challenges],
  );
  const published = publication.rows[0];
  if (
    !published ||
    published.published_levels !== levels.length ||
    published.published_challenges !== challenges.length ||
    published.published_challenges_within_levels !== challenges.length ||
    published.all_required_challenges !== challenges.length
  ) {
    return blank;
  }

  // A level completion must be a genuine server-recorded, completed session
  // meeting the approved per-level score threshold.
  const completed = await db.query<{ level_version_id: string; completed_at: Date }>(
    `select distinct on (level_version_id) level_version_id, completed_at
       from level_play_sessions
      where user_id = $1 and level_version_id = any($2::uuid[])
        and state = 'completed' and completed_at is not null
        and max_points > 0
        and awarded_points * 100 >= max_points * $3
      order by level_version_id, completed_at desc`,
    [userId, levels, r.minimum_pass_percent],
  );

  // "correct" is an evaluated, server-signed attempt; "needs_review" and
  // incorrect attempts may never qualify even if the progress UI says 100%.
  const passed = await db.query<{ challenge_version_id: string; evaluated_at: Date }>(
    `select distinct on (challenge_version_id) challenge_version_id, evaluated_at
       from challenge_attempts
      where user_id = $1 and challenge_version_id = any($2::uuid[])
        and status = 'correct'
      order by challenge_version_id, evaluated_at desc`,
    [userId, challenges],
  );

  const capstone = r.required_capstone
    ? await db.query<{ decision: string; verified_at: Date }>(
        `select decision, verified_at from skill_capstone_attestations
          where user_id = $1 and requirement_set_id = $2
          order by verified_at desc, id desc limit 1`,
        [userId, r.id],
      )
    : null;
  const capstonePassed = !r.required_capstone || capstone?.rows[0]?.decision === "passed";
  const levelCount = completed.rows.length;
  const challengeCount = passed.rows.length;
  const good =
    levelCount === levels.length && challengeCount === challenges.length && capstonePassed;
  const dates = [
    ...completed.rows.map((row) => row.completed_at.getTime()),
    ...passed.rows.map((row) => row.evaluated_at.getTime()),
    ...(capstonePassed && capstone?.rows[0] ? [capstone.rows[0].verified_at.getTime()] : []),
  ];
  const completedAt = good ? new Date(Math.max(...dates)) : null;
  return {
    status: good ? "eligible" : "incomplete",
    requiredLevels: levels.length,
    completedLevels: levelCount,
    requiredChallenges: challenges.length,
    passedChallenges: challengeCount,
    capstoneRequired: r.required_capstone,
    capstonePassed,
    completedAt,
    evidenceHash: good
      ? digest({
          userId,
          requirementId: r.id,
          versionDigest: r.content_digest,
          levelIds: levels,
          challengeIds: challenges,
          score: r.minimum_pass_percent,
          evaluatedAt: completedAt?.toISOString(),
        })
      : "",
  };
}

async function frozenAward(
  db: Pick<PoolClient, "query">,
  userId: string,
  skillId: string,
  requirementId: string,
): Promise<CertificateSummary | null> {
  const result = await db.query<{
    id: string;
    public_id: string;
    certificate_title: string;
    completed_at: Date;
    issued_at: Date;
    revoked_at: Date | null;
  }>(
    `select id, public_id, certificate_title, completed_at, issued_at, revoked_at
       from skill_certificate_awards
      where user_id = $1 and skill_id = $2 and requirement_set_id = $3`,
    [userId, skillId, requirementId],
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    id: row.id,
    publicId: row.public_id,
    title: row.certificate_title,
    completedAt: row.completed_at.toISOString(),
    issuedAt: row.issued_at.toISOString(),
    status: row.revoked_at ? "revoked" : "issued",
  };
}

export function createCertificateService(
  options: Readonly<{ pool: DatabaseClient["pool"]; issuanceEnabled: boolean }>,
): CertificateService {
  return {
    list: async (userId) => {
      uuid.parse(userId);
      const result = await options.pool.query<{
        id: string;
        public_id: string;
        certificate_title: string;
        completed_at: Date;
        issued_at: Date;
        revoked_at: Date | null;
      }>(
        `select id, public_id, certificate_title, completed_at, issued_at, revoked_at
           from skill_certificate_awards
          where user_id = $1 order by issued_at desc, id desc limit 100`,
        [userId],
      );
      return result.rows.map((row) => ({
        id: row.id,
        publicId: row.public_id,
        title: row.certificate_title,
        completedAt: row.completed_at.toISOString(),
        issuedAt: row.issued_at.toISOString(),
        status: row.revoked_at ? "revoked" : "issued",
      }));
    },

    eligibility: async (userId, skillSlug) => {
      uuid.parse(userId);
      slug.parse(skillSlug);
      const r = await policy(options.pool, skillSlug);
      if (!r) {
        return {
          status: "unavailable",
          requiredLevels: 0,
          completedLevels: 0,
          requiredChallenges: 0,
          passedChallenges: 0,
          capstoneRequired: true,
          capstonePassed: false,
        };
      }
      const awarded = await frozenAward(options.pool, userId, r.skill_id, r.id);
      if (awarded?.status === "issued") {
        return {
          status: "earned",
          requiredLevels: r.level_version_ids.length,
          completedLevels: r.level_version_ids.length,
          requiredChallenges: r.challenge_version_ids.length,
          passedChallenges: r.challenge_version_ids.length,
          capstoneRequired: r.required_capstone,
          capstonePassed: true,
        };
      }
      const evidence = await verifiedEvidence(options.pool, userId, r);
      return {
        status: evidence.status,
        requiredLevels: evidence.requiredLevels,
        completedLevels: evidence.completedLevels,
        requiredChallenges: evidence.requiredChallenges,
        passedChallenges: evidence.passedChallenges,
        capstoneRequired: evidence.capstoneRequired,
        capstonePassed: evidence.capstonePassed,
      };
    },

    issue: async (learner, skillSlug) => {
      if (!options.issuanceEnabled) {
        throw new CertificateError(
          403,
          "Certificate issuance requires approved completion policies and an explicitly enabled environment.",
        );
      }
      slug.parse(skillSlug);
      const name = learner.profile.displayName?.trim();
      if (!name || name.length < 2 || name.length > 60) {
        throw new CertificateError(
          409,
          "A verified learner profile name is required before certificate issuance.",
        );
      }
      const db = await options.pool.connect();
      try {
        await db.query("begin");
        const locked = await db.query(
          "select id from users where id = $1 and status = 'active' for update",
          [learner.id],
        );
        if (!locked.rowCount) throw new CertificateError(403, "Learner account is not active.");
        const r = await policy(db, skillSlug);
        if (!r)
          throw new CertificateError(
            409,
            "An independently approved completion policy and published course are required.",
          );

        const existing = await frozenAward(db, learner.id, r.skill_id, r.id);
        if (existing) {
          if (existing.status === "revoked")
            throw new CertificateError(
              409,
              "This certificate has been revoked and cannot be reissued automatically.",
            );
          await db.query("commit");
          return existing;
        }

        const evidence = await verifiedEvidence(db, learner.id, r);
        if (evidence.status !== "eligible" || !evidence.completedAt) {
          throw new CertificateError(
            409,
            "All published mandatory challenges, passing levels and capstone evidence must be complete.",
          );
        }
        const publicId = "SC-" + randomBytes(24).toString("base64url");
        const title = "Certificate of Completion — " + r.skill_title;
        const result = await db.query<{ id: string }>(
          `insert into skill_certificate_awards
              (public_id,user_id,skill_id,requirement_set_id,certificate_title,
               learner_name,evidence_digest,completed_at)
            values ($1,$2,$3,$4,$5,$6,$7,$8)
            on conflict (user_id,skill_id,requirement_set_id) do nothing
            returning id`,
          [
            publicId,
            learner.id,
            r.skill_id,
            r.id,
            title,
            name,
            evidence.evidenceHash,
            evidence.completedAt,
          ],
        );
        if (result.rows[0]) {
          await db.query(
            `insert into skill_certificate_events
              (award_id,actor_user_id,action,reason,event_digest)
             values ($1,$2,'issued',$3,$4)`,
            [
              result.rows[0].id,
              learner.id,
              "All versioned mandatory published requirements independently verified as completed.",
              evidence.evidenceHash,
            ],
          );
        }
        const award = await frozenAward(db, learner.id, r.skill_id, r.id);
        if (!award || award.status !== "issued")
          throw new CertificateError(409, "No valid certificate award was recorded.");
        await db.query("commit");
        return award;
      } catch (error) {
        await db.query("rollback").catch(() => undefined);
        throw error;
      } finally {
        db.release();
      }
    },
  };
}

export function registerCertificateRoutes(
  app: FastifyInstance,
  options: Readonly<{
    config: ApiConfig;
    authService: AuthService;
    service: CertificateService;
  }>,
): void {
  app.get("/v1/me/certificates", async (request, reply) => {
    const learner = await requireAuthenticatedLearner(request, options.config, options.authService);
    reply.header("cache-control", "private, no-store");
    reply.header("x-robots-tag", "noindex, nofollow");
    return { certificates: await options.service.list(learner.id) };
  });

  app.get("/v1/me/certificate-eligibility/:skillSlug", async (request, reply) => {
    const learner = await requireAuthenticatedLearner(request, options.config, options.authService);
    const { skillSlug } = z.object({ skillSlug: slug }).parse(request.params);
    reply.header("cache-control", "private, no-store");
    return { eligibility: await options.service.eligibility(learner.id, skillSlug) };
  });

  app.post("/v1/me/certificate-claims/:skillSlug", async (request, reply) => {
    requireTrustedRequestOrigin(request, options.config);
    const learner = await requireAuthenticatedLearner(request, options.config, options.authService);
    const { skillSlug } = z.object({ skillSlug: slug }).parse(request.params);
    reply.header("cache-control", "private, no-store");
    return { certificate: await options.service.issue(learner, skillSlug) };
  });
}
