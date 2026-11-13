import { createHash } from "node:crypto";

import type { DatabaseClient } from "@skillup/database";
import type { PoolClient } from "pg";

import type { AdminIdentity } from "./admin.js";

export class CourseEditorialError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "CourseEditorialError";
  }
}

type Role = "content_editor" | "content_reviewer" | "publisher";
type ReviewKind = "subject" | "accessibility";
type Decision = "approve" | "request_changes";
type EditorialInput = Readonly<{ reason: string }>;
type ReviewInput = EditorialInput &
  Readonly<{ kind: ReviewKind; decision: Decision; checklist: Record<string, boolean> }>;
type PublishInput = EditorialInput & Readonly<{ stagingEvidenceUrl: string }>;
type SubmissionRow = {
  id: string;
  skill_id: string;
  path_id: string;
  content_digest: string;
  version_manifest: Record<string, unknown>;
  submitted_by: string;
  status: string;
  published_by: string | null;
  published_at: Date | null;
  submitted_at: Date;
};

type Candidate = Readonly<{
  slug: string;
  skillId: string;
  pathId: string;
  digest: string;
  manifest: Record<string, unknown>;
  counts: Readonly<{ modules: number; levels: number; challenges: number }>;
}>;

const requiredChecklists: Record<ReviewKind, readonly string[]> = {
  subject: [
    "facts_verified",
    "answer_keys_verified",
    "source_rights_verified",
    "assessments_verified",
  ],
  accessibility: [
    "language_checked",
    "keyboard_mobile_checked",
    "accessibility_checked",
    "capstone_verified",
  ],
};
const digestPattern = /^[a-f0-9]{64}$/;

function requireRole(actor: AdminIdentity, role: Role): void {
  if (!actor.roles.includes(role)) {
    throw new CourseEditorialError(403, "An independent authorized editorial role is required.");
  }
}
function incompatible(message: string): never {
  throw new CourseEditorialError(409, message);
}
function canonical(data: unknown): unknown {
  if (Array.isArray(data)) return data.map(canonical);
  if (data !== null && typeof data === "object") {
    return Object.fromEntries(
      Object.entries(data as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, value]) => [key, canonical(value)]),
    );
  }
  return data;
}
function stableHash(data: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(canonical(data)))
    .digest("hex");
}
function ids(manifest: Record<string, unknown>, key: string): string[] {
  const value = manifest[key];
  if (!Array.isArray(value) || !value.every((id) => typeof id === "string")) {
    incompatible("The frozen course version manifest is invalid.");
  }
  return value as string[];
}
async function inTransaction<T>(
  pool: DatabaseClient["pool"],
  action: (db: PoolClient) => Promise<T>,
): Promise<T> {
  const db = await pool.connect();
  try {
    await db.query("begin");
    const result = await action(db);
    await db.query("commit");
    return result;
  } catch (error) {
    await db.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    db.release();
  }
}
async function lockSkill(db: PoolClient, skillId: string): Promise<void> {
  const lock = await db.query("select id from skills where id = $1 for update", [skillId]);
  if (!lock.rowCount) incompatible("The draft course no longer exists.");
}
async function loadSubmission(db: PoolClient, id: string): Promise<SubmissionRow> {
  const result = await db.query<SubmissionRow>(
    "select * from course_editorial_submissions where id = $1 for update",
    [id],
  );
  const row = result.rows[0];
  if (!row) throw new CourseEditorialError(404, "The course submission was not found.");
  return row;
}
async function audit(
  db: PoolClient,
  id: string,
  actorId: string,
  action: string,
  reason: string,
  digest: string,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  await db.query(
    `insert into course_editorial_events
      (submission_id, actor_user_id, action, reason, content_digest, metadata)
      values ($1, $2, $3, $4, $5, $6::jsonb)`,
    [id, actorId, action, reason, digest, JSON.stringify(metadata)],
  );
}

async function loadCandidate(db: PoolClient, slug: string): Promise<Candidate> {
  const head = await db.query<{
    skill_id: string;
    path_id: string;
    slug: string;
    skill_version_id: string;
    path_version_id: string;
    skill_material: unknown;
    path_material: unknown;
  }>(
    `select s.id as skill_id, s.slug, p.id as path_id,
        sv.id as skill_version_id, pv.id as path_version_id,
        to_jsonb(sv) as skill_material, to_jsonb(pv) as path_material
      from skills s
      join lateral (
        select v.* from skill_versions v
        where v.skill_id = s.id and v.locale = s.default_locale and v.status = 'draft'
        order by v.version desc limit 1
      ) sv on true
      join learning_paths p on p.skill_id = s.id
      join lateral (
        select v.* from learning_path_versions v
        where v.learning_path_id = p.id and v.locale = s.default_locale and v.status = 'draft'
        order by v.version desc limit 1
      ) pv on true
      where s.slug = $1 and s.status in ('draft', 'published')
        and p.status in ('draft', 'published')
        and sv.version = (select max(version) from skill_versions where skill_id = s.id and locale = s.default_locale)
        and pv.version = (select max(version) from learning_path_versions where learning_path_id = p.id and locale = s.default_locale)`,
    [slug],
  );
  if (head.rows.length !== 1)
    incompatible("Exactly one complete, latest draft hierarchy is required.");
  const root = head.rows[0]!;

  // Left joins are intentional: missing draft versions cannot be hidden by an inner join.
  // Each row also fingerprints confidential evaluator keys, options, objective and sources.
  const data = await db.query<{
    module_id: string;
    module_version_id: string | null;
    lesson_id: string | null;
    lesson_version_id: string | null;
    level_id: string | null;
    level_version_id: string | null;
    challenge_id: string | null;
    challenge_version_id: string | null;
    module_material: unknown;
    lesson_material: unknown;
    level_material: unknown;
    challenge_material: unknown;
    evaluation_material: unknown;
    answer_options: unknown;
    source_references: unknown;
    learning_objectives: unknown;
  }>(
    `select m.id as module_id, mv.id as module_version_id,
         les.id as lesson_id, lessv.id as lesson_version_id,
         lvl.id as level_id, lv.id as level_version_id,
         ch.id as challenge_id, cv.id as challenge_version_id,
         to_jsonb(mv) as module_material, to_jsonb(lessv) as lesson_material,
         to_jsonb(lv) as level_material, to_jsonb(cv) as challenge_material,
         ce.private_evaluation as evaluation_material,
         (select coalesce(jsonb_agg(to_jsonb(o) order by o.sort_order, o.id), '[]'::jsonb)
            from challenge_answer_options o where o.challenge_version_id = cv.id) as answer_options,
         (select coalesce(jsonb_agg(to_jsonb(sr) order by sr.sort_order, sr.id), '[]'::jsonb)
            from content_source_references sr where sr.level_version_id = lv.id) as source_references,
         (select coalesce(jsonb_agg(to_jsonb(ob) order by ob.sort_order, ob.id), '[]'::jsonb)
            from learning_objectives ob where ob.level_version_id = lv.id) as learning_objectives
    from learning_modules m
    left join lateral (
      select v.* from learning_module_versions v
       where v.module_id = m.id and v.learning_path_version_id = $2 and v.state = 'draft'
       order by v.version desc limit 1
    ) mv on true
    left join lessons les on les.module_id = m.id
    left join lateral (
      select v.* from lesson_versions v
       where v.lesson_id = les.id and v.module_version_id = mv.id and v.state = 'draft'
       order by v.version desc limit 1
    ) lessv on true
    left join levels lvl on lvl.lesson_id = les.id
    left join lateral (
      select v.* from level_versions v
       where v.level_id = lvl.id and v.lesson_version_id = lessv.id and v.state = 'draft'
       order by v.version desc limit 1
    ) lv on true
    left join challenges ch on ch.level_id = lvl.id
    left join lateral (
      select v.* from challenge_versions v
       where v.challenge_id = ch.id and v.level_version_id = lv.id and v.state = 'draft'
       order by v.version desc limit 1
    ) cv on true
    left join challenge_evaluations ce on ce.challenge_version_id = cv.id
    where m.learning_path_id = $1
    order by m.sort_order, les.sort_order, lvl.sort_order, ch.sort_order`,
    [root.path_id, root.path_version_id],
  );
  const rows = data.rows;
  const unique = (field: keyof (typeof rows)[number]): string[] => [
    ...new Set(rows.map((r) => r[field]).filter((v): v is string => typeof v === "string")),
  ];
  const modules = unique("module_id");
  const moduleVersions = unique("module_version_id");
  const lessonVersions = unique("lesson_version_id");
  const levelVersions = unique("level_version_id");
  const challengeVersions = unique("challenge_version_id");
  const levels = unique("level_id");
  const challenges = unique("challenge_id");

  if (
    modules.length !== 4 ||
    moduleVersions.length !== modules.length ||
    levels.length !== 24 ||
    levelVersions.length !== levels.length ||
    lessonVersions.length !== levels.length ||
    challenges.length < 72 ||
    challengeVersions.length !== challenges.length ||
    rows.some(
      (r) =>
        !r.module_version_id ||
        !r.lesson_version_id ||
        !r.level_version_id ||
        !r.challenge_version_id ||
        !r.evaluation_material ||
        Object.keys(r.evaluation_material as object).length === 0 ||
        !Array.isArray(r.source_references) ||
        r.source_references.length === 0 ||
        !Array.isArray(r.learning_objectives) ||
        r.learning_objectives.length === 0,
    ) ||
    levels.some((id) => rows.filter((r) => r.level_id === id).length < 3)
  ) {
    incompatible(
      "AIFS cannot submit outlines or incomplete courses: require 4 modules, 24 complete levels, 3+ evaluated exercises per level, provenance and assessable objectives.",
    );
  }

  const material = { skill: root.skill_material, path: root.path_material, rows };
  const digest = stableHash(material);
  if (!digestPattern.test(digest)) incompatible("Invalid content digest.");
  return {
    slug: root.slug,
    skillId: root.skill_id,
    pathId: root.path_id,
    digest,
    counts: { modules: modules.length, levels: levels.length, challenges: challenges.length },
    manifest: {
      skill: [root.skill_version_id],
      path: [root.path_version_id],
      module: moduleVersions,
      lesson: lessonVersions,
      level: levelVersions,
      challenge: challengeVersions,
      counts: { modules: modules.length, levels: levels.length, challenges: challenges.length },
    },
  };
}

const versionTables = [
  ["skill", "skill_versions", "status"],
  ["path", "learning_path_versions", "status"],
  ["module", "learning_module_versions", "state"],
  ["lesson", "lesson_versions", "state"],
  ["level", "level_versions", "state"],
  ["challenge", "challenge_versions", "state"],
] as const;
const recordTypes: Record<string, string> = {
  skill: "skill_version",
  path: "learning_path_version",
  module: "module_version",
  lesson: "lesson_version",
  level: "level_version",
  challenge: "challenge_version",
};

async function setVersionStatuses(
  db: PoolClient,
  manifest: Record<string, unknown>,
  from: "draft" | "published" | "archived",
  to: "published" | "archived",
  reviewedAt: Date,
  slug: string,
): Promise<void> {
  for (const [key, table, stateColumn] of versionTables) {
    const targets = ids(manifest, key);
    // Existing version triggers require genuine draft -> in_review -> approved ->
    // published transitions. Every intermediate step remains inside this atomic
    // transaction, after signed independent reviews were already persisted.
    const isLegacy = key === "skill" || key === "path";
    if (!isLegacy && from === "draft" && to === "published") {
      for (const [before, after] of [
        ["draft", "in_review"],
        ["in_review", "approved"],
      ] as const) {
        const intermediate = await db.query(
          `update ${table} set ${stateColumn} = $3
             where id = any($1::uuid[]) and ${stateColumn} = $2`,
          [targets, before, after],
        );
        if (intermediate.rowCount !== targets.length) {
          incompatible("The frozen course version is incomplete or was changed during review.");
        }
      }
    }
    const sourceState = !isLegacy && from === "draft" && to === "published"
      ? "approved" : from;
    const result = await db.query(
      `update ${table} set ${stateColumn} = $3,
         reviewed_at = case when $3 = 'published' then $4 else reviewed_at end,
         published_at = case when $3 = 'published' then now() else published_at end
       where id = any($1::uuid[]) and ${stateColumn} = $2`,
      [targets, sourceState, to, reviewedAt],
    );
    if (result.rowCount !== targets.length) {
      incompatible("One or more frozen course versions have changed; publication was rolled back.");
    }

    const entityType = recordTypes[key]!;
    const existingState = to === "published" ? "published" : "superseded";
    if (to === "published") {
      await db.query(
        `insert into content_publication_records
          (entity_type, entity_version_id, state, index_policy, canonical_path,
           reviewed_at, published_at, updated_at)
         select $1, unnest($2::uuid[]), 'published',
                case when $1 = 'skill_version' then 'index' else 'noindex' end,
                $3, $4, now(), now()
         on conflict (entity_type, entity_version_id)
         do update set state = 'published', reviewed_at = $4,
               published_at = now(), updated_at = now()`,
        [entityType, targets, "/en/skills/" + slug, reviewedAt],
      );
    } else {
      await db.query(
        `update content_publication_records set state = $3, updated_at = now()
           where entity_type = $1 and entity_version_id = any($2::uuid[])`,
        [entityType, targets, existingState],
      );
    }
  }
}

export type CourseEditorialService = Readonly<{
  submit: (
    actor: AdminIdentity,
    slug: string,
    input: EditorialInput,
  ) => Promise<Record<string, unknown>>;
  review: (
    actor: AdminIdentity,
    id: string,
    input: ReviewInput,
  ) => Promise<Record<string, unknown>>;
  publish: (
    actor: AdminIdentity,
    id: string,
    input: PublishInput,
  ) => Promise<Record<string, unknown>>;
  withdraw: (
    actor: AdminIdentity,
    id: string,
    input: EditorialInput,
  ) => Promise<Record<string, unknown>>;
  rollback: (
    actor: AdminIdentity,
    id: string,
    input: EditorialInput,
  ) => Promise<Record<string, unknown>>;
  history: (slug: string) => Promise<readonly Record<string, unknown>[]>;
}>;

export function createCourseEditorialService(
  options: Readonly<{
    pool: DatabaseClient["pool"];
    publishEnabled: boolean;
  }>,
): CourseEditorialService {
  return {
    submit: async (actor, slug, input) => {
      requireRole(actor, "content_editor");
      return inTransaction(options.pool, async (db) => {
        const candidate = await loadCandidate(db, slug);
        await lockSkill(db, candidate.skillId);
        const existing = await db.query<{ content_digest: string; status: string }>(
          `select content_digest, status from course_editorial_submissions
            where skill_id = $1 order by submitted_at desc limit 1 for update`,
          [candidate.skillId],
        );
        const last = existing.rows[0];
        if (last && ["submitted", "approved"].includes(last.status)) {
          incompatible("A course review is already active; it must be decided first.");
        }
        if (last?.status === "changes_requested" && last.content_digest === candidate.digest) {
          incompatible("A rejected draft must be materially revised before resubmission.");
        }
        const inserted = await db.query<{ id: string }>(
          `insert into course_editorial_submissions
             (skill_id, path_id, content_digest, version_manifest, submitted_by, reason)
           values ($1, $2, $3, $4::jsonb, $5, $6) returning id`,
          [
            candidate.skillId,
            candidate.pathId,
            candidate.digest,
            JSON.stringify(candidate.manifest),
            actor.userId,
            input.reason,
          ],
        );
        const id = inserted.rows[0]!.id;
        await audit(
          db,
          id,
          actor.userId,
          "submit",
          input.reason,
          candidate.digest,
          candidate.counts,
        );
        return { id, status: "submitted", digest: candidate.digest, counts: candidate.counts };
      });
    },

    review: async (actor, id, input) => {
      requireRole(actor, "content_reviewer");
      return inTransaction(options.pool, async (db) => {
        const submission = await loadSubmission(db, id);
        if (submission.status !== "submitted")
          incompatible("Only pending courses can be reviewed.");
        if (submission.submitted_by === actor.userId)
          incompatible("An editor cannot review their own submission.");
        await lockSkill(db, submission.skill_id);
        const candidate = await loadCandidateForSubmission(db, submission);
        const previous = await db.query<{ reviewer_user_id: string }>(
          "select reviewer_user_id from course_editorial_reviews where submission_id = $1 for update",
          [id],
        );
        if (previous.rows.some((r) => r.reviewer_user_id === actor.userId)) {
          incompatible("Subject and accessibility approvals require different human reviewers.");
        }
        if (
          input.decision === "approve" &&
          requiredChecklists[input.kind].some((key) => input.checklist[key] !== true)
        ) {
          incompatible(
            "Every required checklist item must be independently checked before approval.",
          );
        }
        await db.query(
          `insert into course_editorial_reviews
            (submission_id, review_kind, decision, reviewer_user_id, content_digest, checklist, reason)
            values ($1, $2, $3, $4, $5, $6::jsonb, $7)`,
          [
            id,
            input.kind,
            input.decision,
            actor.userId,
            candidate.digest,
            JSON.stringify(input.checklist),
            input.reason,
          ],
        );
        const action =
          input.decision === "request_changes"
            ? "request_changes"
            : input.kind === "subject"
              ? "approve_subject"
              : "approve_accessibility";
        await audit(db, id, actor.userId, action, input.reason, candidate.digest, {
          kind: input.kind,
        });
        const reviewed = await db.query<{ count: number }>(
          `select count(*)::int as count from course_editorial_reviews
              where submission_id = $1 and decision = 'approve'`,
          [id],
        );
        const status =
          input.decision === "request_changes"
            ? "changes_requested"
            : reviewed.rows[0]?.count === 2
              ? "approved"
              : "submitted";
        await db.query(
          "update course_editorial_submissions set status = $2, updated_at = now() where id = $1",
          [id, status],
        );
        return { id, status, digest: candidate.digest, reviewKind: input.kind };
      });
    },

    publish: async (actor, id, input) => {
      requireRole(actor, "publisher");
      if (!options.publishEnabled) {
        throw new CourseEditorialError(
          403,
          "Course release is disabled until explicitly enabled for an authorized environment.",
        );
      }
      return inTransaction(options.pool, async (db) => {
        const submission = await loadSubmission(db, id);
        if (submission.status !== "approved")
          incompatible("Two independent signed reviews are required before publication.");
        await lockSkill(db, submission.skill_id);
        const reviews = await db.query<{
          reviewer_user_id: string;
          review_kind: string;
          created_at: Date;
        }>(
          `select reviewer_user_id, review_kind, created_at
             from course_editorial_reviews where submission_id = $1 and decision = 'approve'
             order by review_kind`,
          [id],
        );
        if (
          reviews.rows.length !== 2 ||
          reviews.rows
            .map((r) => r.review_kind)
            .sort()
            .join(",") !== "accessibility,subject" ||
          new Set([
            submission.submitted_by,
            actor.userId,
            ...reviews.rows.map((r) => r.reviewer_user_id),
          ]).size !== 4
        ) {
          incompatible(
            "Publisher, submitter, subject reviewer and accessibility reviewer must be four distinct people.",
          );
        }
        const candidate = await loadCandidateForSubmission(db, submission);
        if (
          !input.stagingEvidenceUrl.startsWith("https://") ||
          input.stagingEvidenceUrl.length > 500
        ) {
          incompatible(
            "A trusted HTTPS course-specific staging QA evidence reference is required.",
          );
        }
        const prior = await db.query<SubmissionRow>(
          `select * from course_editorial_submissions
             where skill_id = $1 and status = 'published' for update`,
          [submission.skill_id],
        );
        if (prior.rows.length > 1) incompatible("Conflicting published course versions.");
        if (prior.rows[0]) {
          await setVersionStatuses(
            db,
            prior.rows[0].version_manifest,
            "published",
            "archived",
            new Date(),
            candidate.slug,
          );
          await db.query(
            "update course_editorial_submissions set status = 'superseded', updated_at = now() where id = $1",
            [prior.rows[0].id],
          );
        }
        const reviewedAt = reviews.rows.reduce(
          (latest, r) => (r.created_at > latest ? r.created_at : latest),
          reviews.rows[0]!.created_at,
        );
        await setVersionStatuses(
          db,
          candidate.manifest,
          "draft",
          "published",
          reviewedAt,
          candidate.slug,
        );
        await db.query("update skills set status = 'published', updated_at = now() where id = $1", [
          submission.skill_id,
        ]);
        await db.query(
          "update learning_paths set status = 'published', updated_at = now() where id = $1",
          [submission.path_id],
        );
        await db.query(
          `update course_editorial_submissions
             set status = 'published', published_at = now(), published_by = $2, updated_at = now()
             where id = $1`,
          [id, actor.userId],
        );
        await audit(db, id, actor.userId, "publish", input.reason, candidate.digest, {
          stagingEvidenceUrl: input.stagingEvidenceUrl,
          replacedSubmissionId: prior.rows[0]?.id ?? null,
        });
        return { id, status: "published", digest: candidate.digest };
      });
    },

    withdraw: async (actor, id, input) => {
      requireRole(actor, "publisher");
      if (!options.publishEnabled)
        throw new CourseEditorialError(
          403,
          "Course withdrawal requires explicit release authority.",
        );
      return inTransaction(options.pool, async (db) => {
        const submission = await loadSubmission(db, id);
        if (submission.status !== "published")
          incompatible("Only a current published release can be withdrawn.");
        await lockSkill(db, submission.skill_id);
        const slug = await skillSlug(db, submission.skill_id);
        await setVersionStatuses(
          db,
          submission.version_manifest,
          "published",
          "archived",
          new Date(),
          slug,
        );
        await db.query("update skills set status = 'archived', updated_at = now() where id = $1", [
          submission.skill_id,
        ]);
        await db.query(
          "update learning_paths set status = 'archived', updated_at = now() where id = $1",
          [submission.path_id],
        );
        await db.query(
          "update course_editorial_submissions set status = 'withdrawn', updated_at = now() where id = $1",
          [id],
        );
        await audit(db, id, actor.userId, "withdraw", input.reason, submission.content_digest);
        return { id, status: "withdrawn", published: false };
      });
    },

    rollback: async (actor, id, input) => {
      requireRole(actor, "publisher");
      if (!options.publishEnabled)
        throw new CourseEditorialError(403, "Course rollback requires explicit release authority.");
      return inTransaction(options.pool, async (db) => {
        const current = await loadSubmission(db, id);
        if (current.status !== "published")
          incompatible("Only the active course release may be rolled back.");
        await lockSkill(db, current.skill_id);
        const prior = await db.query<SubmissionRow>(
          `select * from course_editorial_submissions
             where skill_id = $1 and status = 'superseded'
             order by published_at desc limit 1 for update`,
          [current.skill_id],
        );
        const previous = prior.rows[0];
        if (!previous)
          incompatible(
            "No independently approved prior course release exists. Use withdrawal instead.",
          );
        if (!previous.published_by || !previous.published_at) {
          incompatible("The prior course release lacks valid publication evidence.");
        }
        const slug = await skillSlug(db, current.skill_id);
        await setVersionStatuses(
          db,
          current.version_manifest,
          "published",
          "archived",
          new Date(),
          slug,
        );
        // Explicit, transaction-local authorization is required by the
        // migration's strict archived-version restoration trigger.
        await db.query("select set_config('skillup.course_editorial_rollback', 'approved', true)");
        await setVersionStatuses(
          db,
          previous.version_manifest,
          "archived",
          "published",
          previous.published_at,
          slug,
        );
        await db.query(
          "update course_editorial_submissions set status = 'superseded', updated_at = now() where id = $1",
          [current.id],
        );
        await db.query(
          "update course_editorial_submissions set status = 'published', updated_at = now() where id = $1",
          [previous.id],
        );
        await audit(
          db,
          current.id,
          actor.userId,
          "rollback",
          input.reason,
          current.content_digest,
          {
            restoredReleaseId: previous.id,
            restoredDigest: previous.content_digest,
          },
        );
        return { id: previous.id, status: "published", rolledBackReleaseId: current.id };
      });
    },

    history: async (slug) => {
      const result = await options.pool.query<Record<string, unknown>>(
        `select e.id, e.status, e.content_digest as "contentDigest",
                  e.submitted_by as "submittedBy", e.published_by as "publishedBy",
                  e.submitted_at as "submittedAt", e.published_at as "publishedAt",
                  e.version_manifest->'counts' as counts,
                  coalesce((
                    select jsonb_agg(jsonb_build_object(
                      'kind',r.review_kind,'decision',r.decision,'reviewerId',r.reviewer_user_id,
                      'reason',r.reason,'at',r.created_at
                    ) order by r.created_at)
                    from course_editorial_reviews r where r.submission_id = e.id
                  ),'[]'::jsonb) as reviews,
                  coalesce((
                    select jsonb_agg(jsonb_build_object(
                      'action',h.action,'actorId',h.actor_user_id,'reason',h.reason,
                      'at',h.occurred_at,'metadata',h.metadata
                    ) order by h.id)
                    from course_editorial_events h where h.submission_id = e.id
                  ),'[]'::jsonb) as events
           from course_editorial_submissions e
           join skills s on s.id = e.skill_id where s.slug = $1
           order by e.submitted_at desc limit 30`,
        [slug],
      );
      return result.rows;
    },
  };
}

async function skillSlug(db: PoolClient, skillId: string): Promise<string> {
  const row = await db.query<{ slug: string }>("select slug from skills where id = $1", [skillId]);
  if (!row.rows[0]) incompatible("Course does not exist.");
  return row.rows[0]!.slug;
}

async function loadCandidateForSubmission(
  db: PoolClient,
  submission: SubmissionRow,
): Promise<Candidate> {
  const skill = await db.query<{ slug: string }>("select slug from skills where id = $1", [
    submission.skill_id,
  ]);
  if (!skill.rows[0]) incompatible("The submitted course no longer exists.");
  const candidate = await loadCandidate(db, skill.rows[0]!.slug);
  if (
    candidate.skillId !== submission.skill_id ||
    candidate.pathId !== submission.path_id ||
    candidate.digest !== submission.content_digest ||
    stableHash(candidate.manifest) !== stableHash(submission.version_manifest)
  ) {
    incompatible(
      "The draft changed since submission. Independent reviews are invalid; create a new immutable submission.",
    );
  }
  return candidate;
}
