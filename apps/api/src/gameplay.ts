import type { PublicChallenge } from "@skillup/content-schema";
import { PublicChallengeSchema } from "@skillup/content-schema";
import type { DatabaseClient } from "@skillup/database";
import {
  ChallengeEvaluationResultSchema,
  ChallengeResponseSchema,
  ChallengeSubmissionSchema,
  evaluateChallenge,
  guardSubmission,
  type ChallengeEvaluationResult,
  type ChallengeSubmission,
} from "@skillup/gameplay-engine";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { PoolClient } from "pg";
import { z } from "zod";

import type { AuthService, AuthenticatedLearner } from "./auth.js";
import type { ApiConfig } from "./config.js";

const LocaleSchema = z.enum(["en", "ur"]);
const SessionStateSchema = z.enum(["active", "completed", "abandoned", "expired"]);

const StartLevelInputSchema = z.object({
  levelVersionId: z.string().uuid().optional(),
  locale: LocaleSchema.default("en"),
});

const SubmissionBodySchema = z.object({
  challengeId: z.string().uuid(),
  challengeVersionId: z.string().uuid(),
  idempotencyKey: z.string().uuid(),
  response: ChallengeResponseSchema,
});

const OptionSchema = z.object({
  key: z.string().regex(/^[a-z0-9_]{1,40}$/),
  label: z.string().min(1).max(500),
  accessibleLabel: z.string().min(1).max(500).nullable().optional(),
});

const GameplaySessionViewSchema = z.object({
  id: z.string().uuid(),
  levelId: z.string().uuid(),
  levelVersionId: z.string().uuid(),
  state: SessionStateSchema,
  currentChallengeOrdinal: z.number().int().min(0),
  awardedPoints: z.number().int().min(0),
  maxPoints: z.number().int().min(0),
  attemptsUsed: z.number().int().min(0),
  maxAttempts: z.number().int().min(0).max(20),
  startedAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  currentChallenge: PublicChallengeSchema.nullable(),
});

export type GameplaySessionView = z.infer<typeof GameplaySessionViewSchema>;

const GameplaySubmissionViewSchema = z.object({
  result: ChallengeEvaluationResultSchema,
  session: GameplaySessionViewSchema,
});

export type GameplaySubmissionView = z.infer<typeof GameplaySubmissionViewSchema>;

export type GameplayService = Readonly<{
  startLevel: (
    userId: string,
    levelId: string,
    input: Readonly<{ levelVersionId?: string | undefined; locale: "en" | "ur" }>,
  ) => Promise<GameplaySessionView>;
  getSession: (userId: string, sessionId: string) => Promise<GameplaySessionView>;
  submit: (userId: string, submission: ChallengeSubmission) => Promise<GameplaySubmissionView>;
}>;

export class GameplayServiceError extends Error {
  readonly statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = "GameplayServiceError";
    this.statusCode = statusCode;
  }
}

type SessionRow = Readonly<{
  id: string;
  user_id: string;
  level_id: string;
  level_version_id: string;
  state: "active" | "completed" | "abandoned" | "expired";
  current_challenge_ordinal: number;
  awarded_points: number;
  max_points: number;
  started_at: Date;
  expires_at: Date;
}>;

type SequenceRow = Readonly<{
  ordinal: number;
  challenge_id: string;
  challenge_version_id: string;
  max_attempts: number;
  max_points: number;
}>;

type ChallengeRow = Readonly<{
  challenge_id: string;
  challenge_version_id: string;
  slug: string;
  version: number;
  locale: "en" | "ur";
  type:
    | "multiple_choice"
    | "true_false"
    | "ordering"
    | "matching"
    | "scenario"
    | "fill_blank"
    | "short_response";
  prompt: string;
  instruction: string | null;
  explanation: string;
  public_payload: Record<string, unknown>;
  private_evaluation: Record<string, unknown>;
  points: number;
}>;

type OptionRow = Readonly<{
  option_key: string;
  label: string;
  accessible_label: string | null;
}>;

type AttemptRow = Readonly<{
  idempotency_key: string;
  request_hash: string;
  challenge_id: string;
  challenge_version_id: string;
  status: "correct" | "incorrect" | "needs_review";
  awarded_points: number;
  max_points: number;
  explanation: string;
  retry_allowed: boolean;
  confidence: string | null;
  matched_criteria: unknown;
  review_reason: string | null;
  attempt_number: number;
  evaluated_at: Date;
}>;

async function transaction<T>(
  pool: DatabaseClient["pool"],
  operation: (database: PoolClient) => Promise<T>,
): Promise<T> {
  const database = await pool.connect();
  try {
    await database.query("begin");
    const result = await operation(database);
    await database.query("commit");
    return result;
  } catch (error) {
    await database.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    database.release();
  }
}

function payloadNumber(payload: Record<string, unknown>, key: string, fallback: number): number {
  const value = payload[key];
  return typeof value === "number" && Number.isInteger(value) ? value : fallback;
}

function payloadString(payload: Record<string, unknown>, key: string): string {
  const value = payload[key];
  if (typeof value !== "string") {
    throw new GameplayServiceError(500, "Published challenge data is incomplete.");
  }
  return value;
}

function publicOptions(rows: readonly OptionRow[]): z.infer<typeof OptionSchema>[] {
  return rows.map((row) =>
    OptionSchema.parse({
      key: row.option_key,
      label: row.label,
      accessibleLabel: row.accessible_label,
    }),
  );
}

function buildPublicChallenge(
  row: ChallengeRow,
  optionRows: readonly OptionRow[],
): PublicChallenge {
  const base = {
    id: row.challenge_id,
    versionId: row.challenge_version_id,
    contentVersion: row.version,
    locale: row.locale,
    slug: row.slug,
    prompt: row.prompt,
    instruction: row.instruction,
    points: row.points,
  };
  const options = publicOptions(optionRows);

  switch (row.type) {
    case "multiple_choice":
      return PublicChallengeSchema.parse({
        ...base,
        type: row.type,
        options,
        selectionLimit: payloadNumber(row.public_payload, "selectionLimit", 1),
      });
    case "true_false":
    case "ordering":
    case "scenario":
      return PublicChallengeSchema.parse({ ...base, type: row.type, options });
    case "matching":
      return PublicChallengeSchema.parse({
        ...base,
        type: row.type,
        left: z.array(OptionSchema).parse(row.public_payload["left"]),
        right: z.array(OptionSchema).parse(row.public_payload["right"]),
      });
    case "fill_blank":
      return PublicChallengeSchema.parse({
        ...base,
        type: row.type,
        placeholder: payloadString(row.public_payload, "placeholder"),
        maxLength: payloadNumber(row.public_payload, "maxLength", 500),
      });
    case "short_response":
      return PublicChallengeSchema.parse({
        ...base,
        type: row.type,
        placeholder: payloadString(row.public_payload, "placeholder"),
        maxLength: payloadNumber(row.public_payload, "maxLength", 2000),
        evaluationNotice: payloadString(row.public_payload, "evaluationNotice"),
      });
  }
}

async function loadChallenge(
  database: PoolClient,
  challengeVersionId: string,
): Promise<Readonly<{ row: ChallengeRow; publicChallenge: PublicChallenge }>> {
  const result = await database.query<ChallengeRow>(
    `select c.id as challenge_id, cv.id as challenge_version_id, c.slug, cv.version,
            cv.locale, cv.type, cv.prompt, cv.instruction, cv.explanation,
            cv.public_payload, ce.private_evaluation, cv.points
       from challenge_versions cv
       join challenges c on c.id = cv.challenge_id
       join challenge_evaluations ce on ce.challenge_version_id = cv.id
      where cv.id = $1 and cv.state = 'published'`,
    [challengeVersionId],
  );
  const row = result.rows[0];
  if (!row) throw new GameplayServiceError(409, "The published challenge version is unavailable.");

  const options = await database.query<OptionRow>(
    `select option_key, label, accessible_label
       from challenge_answer_options
      where challenge_version_id = $1
      order by sort_order`,
    [challengeVersionId],
  );
  return { row, publicChallenge: buildPublicChallenge(row, options.rows) };
}

async function loadSessionRow(
  database: PoolClient,
  userId: string,
  sessionId: string,
  lock: boolean,
): Promise<SessionRow> {
  const result = await database.query<SessionRow>(
    `select id, user_id, level_id, level_version_id, state,
            current_challenge_ordinal, awarded_points, max_points, started_at, expires_at
       from level_play_sessions
      where id = $1 and user_id = $2${lock ? " for update" : ""}`,
    [sessionId, userId],
  );
  const row = result.rows[0];
  if (!row) throw new GameplayServiceError(404, "The gameplay session was not found.");
  return row;
}

async function expireSessionIfRequired(
  database: PoolClient,
  session: SessionRow,
  now: Date,
): Promise<SessionRow> {
  if (session.state !== "active" || session.expires_at.getTime() > now.getTime()) return session;
  await database.query(
    "update level_play_sessions set state = 'expired', last_activity_at = $2 where id = $1",
    [session.id, now],
  );
  return { ...session, state: "expired" };
}

async function loadSequence(
  database: PoolClient,
  sessionId: string,
  ordinal: number,
): Promise<SequenceRow | null> {
  const result = await database.query<SequenceRow>(
    `select ordinal, challenge_id, challenge_version_id, max_attempts, max_points
       from level_session_challenges
      where session_id = $1 and ordinal = $2`,
    [sessionId, ordinal],
  );
  return result.rows[0] ?? null;
}

async function countAttempts(
  database: PoolClient,
  sessionId: string,
  challengeVersionId: string,
): Promise<number> {
  const result = await database.query<{ attempts: number }>(
    `select count(*)::int as attempts
       from challenge_attempts
      where session_id = $1 and challenge_version_id = $2`,
    [sessionId, challengeVersionId],
  );
  return result.rows[0]?.attempts ?? 0;
}

async function sessionView(
  database: PoolClient,
  sessionInput: SessionRow,
  now: Date,
): Promise<GameplaySessionView> {
  const session = await expireSessionIfRequired(database, sessionInput, now);
  const sequence = await loadSequence(database, session.id, session.current_challenge_ordinal);
  if (!sequence) {
    return GameplaySessionViewSchema.parse({
      id: session.id,
      levelId: session.level_id,
      levelVersionId: session.level_version_id,
      state: session.state,
      currentChallengeOrdinal: session.current_challenge_ordinal,
      awardedPoints: session.awarded_points,
      maxPoints: session.max_points,
      attemptsUsed: 0,
      maxAttempts: 0,
      startedAt: session.started_at.toISOString(),
      expiresAt: session.expires_at.toISOString(),
      currentChallenge: null,
    });
  }

  const challenge = await loadChallenge(database, sequence.challenge_version_id);
  const attemptsUsed = await countAttempts(database, session.id, sequence.challenge_version_id);
  return GameplaySessionViewSchema.parse({
    id: session.id,
    levelId: session.level_id,
    levelVersionId: session.level_version_id,
    state: session.state,
    currentChallengeOrdinal: session.current_challenge_ordinal,
    awardedPoints: session.awarded_points,
    maxPoints: session.max_points,
    attemptsUsed,
    maxAttempts: sequence.max_attempts,
    startedAt: session.started_at.toISOString(),
    expiresAt: session.expires_at.toISOString(),
    currentChallenge: challenge.publicChallenge,
  });
}

function storedResult(row: AttemptRow): ChallengeEvaluationResult {
  return ChallengeEvaluationResultSchema.parse({
    challengeId: row.challenge_id,
    challengeVersionId: row.challenge_version_id,
    status: row.status,
    awardedPoints: row.awarded_points,
    maxPoints: row.max_points,
    explanation: row.explanation,
    retryAllowed: row.retry_allowed,
    attemptNumber: row.attempt_number,
    evaluatedAt: row.evaluated_at.toISOString(),
  });
}

export function createGameplayService(
  options: Readonly<{
    pool: DatabaseClient["pool"];
    now?: () => Date;
    sessionHours?: number;
  }>,
): GameplayService {
  const now = options.now ?? (() => new Date());
  const sessionHours = z
    .number()
    .int()
    .min(1)
    .max(168)
    .parse(options.sessionHours ?? 24);

  return {
    startLevel: async (userId, levelId, input) =>
      transaction(options.pool, async (database) => {
        const version = await database.query<{
          level_id: string;
          level_version_id: string;
        }>(
          `select lv.level_id, lv.id as level_version_id
             from level_versions lv
            where lv.level_id = $1
              and lv.locale = $2
              and lv.state = 'published'
              and ($3::uuid is null or lv.id = $3)
            order by lv.version desc
            limit 1`,
          [levelId, input.locale, input.levelVersionId ?? null],
        );
        const selected = version.rows[0];
        if (!selected)
          throw new GameplayServiceError(404, "The published level version was not found.");

        const requestedAt = now();
        await database.query("select id from users where id = $1 for update", [userId]);
        const activeSession = await database.query<SessionRow>(
          `select id, user_id, level_id, level_version_id, state,
                  current_challenge_ordinal, awarded_points, max_points, started_at, expires_at
             from level_play_sessions
            where user_id = $1 and level_version_id = $2 and state = 'active'
            order by started_at desc
            limit 1
            for update`,
          [userId, selected.level_version_id],
        );
        const existingSession = activeSession.rows[0];
        if (existingSession) {
          const resumedSession = await expireSessionIfRequired(
            database,
            existingSession,
            requestedAt,
          );
          if (resumedSession.state === "active") {
            return sessionView(database, resumedSession, requestedAt);
          }
        }

        const challenges = await database.query<{
          challenge_id: string;
          challenge_version_id: string;
          points: number;
        }>(
          `select c.id as challenge_id, cv.id as challenge_version_id, cv.points
             from challenges c
             join challenge_versions cv on cv.challenge_id = c.id
            where c.level_id = $1
              and cv.level_version_id = $2
              and cv.locale = $3
              and cv.state = 'published'
            order by c.sort_order`,
          [selected.level_id, selected.level_version_id, input.locale],
        );
        if (challenges.rows.length === 0) {
          throw new GameplayServiceError(409, "The published level has no playable challenges.");
        }

        const maxPoints = challenges.rows.reduce((sum, challenge) => sum + challenge.points, 0);
        const startedAt = requestedAt;
        const expiresAt = new Date(startedAt.getTime() + sessionHours * 3_600_000);
        const inserted = await database.query<SessionRow>(
          `insert into level_play_sessions
            (user_id, level_id, level_version_id, state, current_challenge_ordinal,
             awarded_points, max_points, started_at, last_activity_at, expires_at)
           values ($1, $2, $3, 'active', 0, 0, $4, $5, $5, $6)
           returning id, user_id, level_id, level_version_id, state,
                     current_challenge_ordinal, awarded_points, max_points, started_at, expires_at`,
          [userId, selected.level_id, selected.level_version_id, maxPoints, startedAt, expiresAt],
        );
        const session = inserted.rows[0];
        if (!session)
          throw new GameplayServiceError(500, "The gameplay session could not be created.");

        for (const [ordinal, challenge] of challenges.rows.entries()) {
          await database.query(
            `insert into level_session_challenges
              (session_id, ordinal, challenge_id, challenge_version_id, max_attempts, max_points)
             values ($1, $2, $3, $4, 2, $5)`,
            [
              session.id,
              ordinal,
              challenge.challenge_id,
              challenge.challenge_version_id,
              challenge.points,
            ],
          );
        }

        return sessionView(database, session, startedAt);
      }),

    getSession: async (userId, sessionId) =>
      transaction(options.pool, async (database) => {
        const session = await loadSessionRow(database, userId, sessionId, false);
        return sessionView(database, session, now());
      }),

    submit: async (userId, submissionInput) =>
      transaction(options.pool, async (database) => {
        const submission = ChallengeSubmissionSchema.parse(submissionInput);
        const evaluatedAt = now();
        let session = await loadSessionRow(database, userId, submission.sessionId, true);

        const existingResult = await database.query<AttemptRow>(
          `select idempotency_key, request_hash, challenge_id, challenge_version_id,
                  status, awarded_points, max_points, explanation, retry_allowed,
                  attempt_number, evaluated_at
             from challenge_attempts
            where session_id = $1 and idempotency_key = $2`,
          [session.id, submission.idempotencyKey],
        );
        const existing = existingResult.rows[0];
        if (existing) {
          const duplicate = guardSubmission({
            authenticatedUserId: userId,
            session: {
              id: session.id,
              userId: session.user_id,
              levelId: session.level_id,
              levelVersionId: session.level_version_id,
              state: session.state,
              currentChallengeId: existing.challenge_id,
              currentChallengeVersionId: existing.challenge_version_id,
              attemptsUsed: 0,
              maxAttempts: 1,
              expiresAt: session.expires_at.toISOString(),
            },
            submission,
            evaluatedAt,
            existingAttempt: {
              idempotencyKey: existing.idempotency_key,
              requestHash: existing.request_hash,
              result: storedResult(existing),
            },
          });
          if (duplicate.kind !== "duplicate") {
            throw new GameplayServiceError(500, "The duplicate submission could not be resolved.");
          }
          return GameplaySubmissionViewSchema.parse({
            result: duplicate.result,
            session: await sessionView(database, session, evaluatedAt),
          });
        }

        session = await expireSessionIfRequired(database, session, evaluatedAt);
        const sequence = await loadSequence(
          database,
          session.id,
          session.current_challenge_ordinal,
        );
        if (!sequence)
          throw new GameplayServiceError(409, "The gameplay session has no active challenge.");
        const attemptsUsed = await countAttempts(
          database,
          session.id,
          sequence.challenge_version_id,
        );
        const guard = guardSubmission({
          authenticatedUserId: userId,
          session: {
            id: session.id,
            userId: session.user_id,
            levelId: session.level_id,
            levelVersionId: session.level_version_id,
            state: session.state,
            currentChallengeId: sequence.challenge_id,
            currentChallengeVersionId: sequence.challenge_version_id,
            attemptsUsed,
            maxAttempts: sequence.max_attempts,
            expiresAt: session.expires_at.toISOString(),
          },
          submission,
          evaluatedAt,
          existingAttempt: null,
        });
        if (guard.kind !== "new") {
          throw new GameplayServiceError(500, "The new submission could not be evaluated.");
        }

        const challenge = await loadChallenge(database, sequence.challenge_version_id);
        const result = evaluateChallenge({
          challenge: challenge.publicChallenge,
          privateEvaluation: challenge.row.private_evaluation,
          response: submission.response,
          explanation: challenge.row.explanation,
          attemptNumber: attemptsUsed + 1,
          maxAttempts: sequence.max_attempts,
          evaluatedAt,
        });

        await database.query(
          `insert into challenge_attempts
            (session_id, user_id, challenge_id, challenge_version_id, attempt_number,
             idempotency_key, request_hash, response_payload, status, awarded_points,
             max_points, explanation, retry_allowed, evaluated_at)
           values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, $12, $13, $14)`,
          [
            session.id,
            userId,
            submission.challengeId,
            submission.challengeVersionId,
            result.attemptNumber,
            submission.idempotencyKey,
            guard.requestHash,
            JSON.stringify(submission.response),
            result.status,
            result.awardedPoints,
            result.maxPoints,
            result.explanation,
            result.retryAllowed,
            evaluatedAt,
          ],
        );

        const shouldAdvance = result.status !== "incorrect" || !result.retryAllowed;
        const nextOrdinal = shouldAdvance
          ? session.current_challenge_ordinal + 1
          : session.current_challenge_ordinal;
        const nextSequence = shouldAdvance
          ? await loadSequence(database, session.id, nextOrdinal)
          : sequence;
        const completed = shouldAdvance && nextSequence === null;
        const updated = await database.query<SessionRow>(
          `update level_play_sessions
              set current_challenge_ordinal = $2,
                  awarded_points = awarded_points + $3,
                  last_activity_at = $4,
                  state = $5,
                  completed_at = case when $5 = 'completed' then $4 else completed_at end
            where id = $1
            returning id, user_id, level_id, level_version_id, state,
                      current_challenge_ordinal, awarded_points, max_points, started_at, expires_at`,
          [
            session.id,
            nextOrdinal,
            result.awardedPoints,
            evaluatedAt,
            completed ? "completed" : "active",
          ],
        );
        const updatedSession = updated.rows[0];
        if (!updatedSession)
          throw new GameplayServiceError(500, "The gameplay session could not be updated.");

        if (completed) {
          await database.query(
            `insert into learner_level_progress
              (user_id, level_id, level_version_id, best_awarded_points, max_points,
               completion_count, last_session_id, first_completed_at, last_completed_at, updated_at)
             values ($1, $2, $3, $4, $5, 1, $6, $7, $7, $7)
             on conflict (user_id, level_version_id) do update
               set best_awarded_points = greatest(learner_level_progress.best_awarded_points, excluded.best_awarded_points),
                   max_points = excluded.max_points,
                   completion_count = learner_level_progress.completion_count + 1,
                   last_session_id = excluded.last_session_id,
                   first_completed_at = coalesce(learner_level_progress.first_completed_at, excluded.first_completed_at),
                   last_completed_at = excluded.last_completed_at,
                   updated_at = excluded.updated_at`,
            [
              userId,
              updatedSession.level_id,
              updatedSession.level_version_id,
              updatedSession.awarded_points,
              updatedSession.max_points,
              updatedSession.id,
              evaluatedAt,
            ],
          );
        }

        return GameplaySubmissionViewSchema.parse({
          result,
          session: await sessionView(database, updatedSession, evaluatedAt),
        });
      }),
  };
}

function parseCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [candidateName, ...valueParts] = part.trim().split("=");
    if (candidateName === name) return decodeURIComponent(valueParts.join("="));
  }
  return null;
}

function requireTrustedOrigin(request: FastifyRequest, config: ApiConfig): void {
  const origin = request.headers.origin;
  if (!origin) return;
  if (origin !== new URL(config.PUBLIC_APP_URL).origin) {
    throw new GameplayServiceError(403, "The request origin is not allowed.");
  }
}

async function requireLearner(
  request: FastifyRequest,
  config: ApiConfig,
  authService: AuthService,
): Promise<AuthenticatedLearner> {
  const sessionToken = parseCookie(request.headers.cookie, config.SESSION_COOKIE_NAME);
  if (!sessionToken) throw new GameplayServiceError(401, "Authentication is required.");
  const learner = await authService.resolveSession(sessionToken);
  if (!learner) throw new GameplayServiceError(401, "The session is invalid or expired.");
  return learner;
}

export function registerGameplayRoutes(
  app: FastifyInstance,
  options: Readonly<{
    config: ApiConfig;
    authService: AuthService;
    gameplayService: GameplayService;
  }>,
): void {
  app.post("/v1/gameplay/levels/:levelId/sessions", async (request, reply) => {
    requireTrustedOrigin(request, options.config);
    const learner = await requireLearner(request, options.config, options.authService);
    const params = z.object({ levelId: z.string().uuid() }).parse(request.params);
    const input = StartLevelInputSchema.parse(request.body ?? {});
    return reply
      .status(201)
      .send(await options.gameplayService.startLevel(learner.id, params.levelId, input));
  });

  app.get("/v1/gameplay/sessions/:sessionId", async (request) => {
    const learner = await requireLearner(request, options.config, options.authService);
    const params = z.object({ sessionId: z.string().uuid() }).parse(request.params);
    return options.gameplayService.getSession(learner.id, params.sessionId);
  });

  app.post("/v1/gameplay/sessions/:sessionId/submissions", async (request) => {
    requireTrustedOrigin(request, options.config);
    const learner = await requireLearner(request, options.config, options.authService);
    const params = z.object({ sessionId: z.string().uuid() }).parse(request.params);
    const body = SubmissionBodySchema.parse(request.body);
    return options.gameplayService.submit(
      learner.id,
      ChallengeSubmissionSchema.parse({ sessionId: params.sessionId, ...body }),
    );
  });
}
