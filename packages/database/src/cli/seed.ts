import { eq } from "drizzle-orm";

import {
  challengeAnswerOptions,
  challengeEvaluations,
  challengeVersions,
  challenges,
  contentPublicationRecords,
  contentSourceReferences,
  createDatabaseClient,
  learningModuleVersions,
  learningModules,
  learningObjectives,
  learningPathVersions,
  learningPaths,
  lessonVersions,
  lessons,
  levelVersions,
  levels,
  requireDatabaseUrl,
  skillCategories,
  skillCategoryMemberships,
  skillCategoryVersions,
  skillVersions,
  skills,
} from "../index.js";
import { launchCatalogSeed } from "../seed-data.js";
import { pilotLearningSeed } from "../pilot-learning-seed.js";

const client = createDatabaseClient({
  connectionString: requireDatabaseUrl(),
  applicationName: "skillup-db-seed",
  maxConnections: 2,
});

const reviewedAt = new Date("2026-07-30T00:00:00.000Z");

try {
  await client.db.transaction(async (transaction) => {
    for (const item of launchCatalogSeed) {
      const isPublished = item.skill.status === "published";

      await transaction
        .insert(skills)
        .values({
          id: item.skill.id,
          slug: item.skill.slug,
          status: item.skill.status,
          defaultLocale: "en",
        })
        .onConflictDoNothing();

      await transaction
        .insert(skillVersions)
        .values({
          id: item.skill.versionId,
          skillId: item.skill.id,
          version: 1,
          locale: "en",
          title: item.skill.title,
          summary: item.skill.summary,
          status: item.skill.status,
          reviewedAt: isPublished ? reviewedAt : null,
          publishedAt: isPublished ? reviewedAt : null,
        })
        .onConflictDoNothing();

      await transaction
        .insert(learningPaths)
        .values({
          id: item.path.id,
          skillId: item.skill.id,
          slug: item.path.slug,
          status: item.path.status,
          sortOrder: item.path.sortOrder,
        })
        .onConflictDoNothing();

      await transaction
        .insert(learningPathVersions)
        .values({
          id: item.path.versionId,
          learningPathId: item.path.id,
          version: 1,
          locale: "en",
          title: item.path.title,
          summary: item.path.summary,
          estimatedMinutes: item.path.estimatedMinutes,
          status: item.path.status,
          reviewedAt: isPublished ? reviewedAt : null,
          publishedAt: isPublished ? reviewedAt : null,
        })
        .onConflictDoNothing();
    }

    const pilot = pilotLearningSeed;

    await transaction
      .insert(skillCategories)
      .values({
        id: pilot.category.id,
        slug: pilot.category.slug,
        defaultLocale: "en",
        sortOrder: 1,
      })
      .onConflictDoNothing();

    await transaction
      .insert(skillCategoryVersions)
      .values({
        id: pilot.category.versionId,
        categoryId: pilot.category.id,
        version: 1,
        locale: "en",
        title: pilot.category.title,
        summary: pilot.category.summary,
        state: "published",
        indexPolicy: "index",
        reviewedAt: pilot.reviewedAt,
        publishedAt: pilot.reviewedAt,
      })
      .onConflictDoNothing();

    await transaction
      .insert(skillCategoryMemberships)
      .values({
        categoryId: pilot.category.id,
        skillId: pilot.skill.id,
        sortOrder: 1,
      })
      .onConflictDoNothing();

    await transaction
      .insert(learningModules)
      .values({
        id: pilot.module.id,
        learningPathId: pilot.path.id,
        slug: pilot.module.slug,
        sortOrder: 1,
      })
      .onConflictDoNothing();

    await transaction
      .insert(learningModuleVersions)
      .values({
        id: pilot.module.versionId,
        moduleId: pilot.module.id,
        learningPathVersionId: pilot.path.versionId,
        version: 1,
        locale: "en",
        title: pilot.module.title,
        summary: pilot.module.summary,
        state: "published",
        indexPolicy: "noindex",
        reviewedAt: pilot.reviewedAt,
        publishedAt: pilot.reviewedAt,
      })
      .onConflictDoNothing();

    await transaction
      .insert(lessons)
      .values({
        id: pilot.lesson.id,
        moduleId: pilot.module.id,
        slug: pilot.lesson.slug,
        sortOrder: 1,
      })
      .onConflictDoNothing();

    await transaction
      .insert(lessonVersions)
      .values({
        id: pilot.lesson.versionId,
        lessonId: pilot.lesson.id,
        moduleVersionId: pilot.module.versionId,
        version: 1,
        locale: "en",
        title: pilot.lesson.title,
        summary: pilot.lesson.summary,
        estimatedMinutes: pilot.lesson.estimatedMinutes,
        state: "published",
        indexPolicy: "noindex",
        reviewedAt: pilot.reviewedAt,
        publishedAt: pilot.reviewedAt,
      })
      .onConflictDoNothing();

    await transaction
      .insert(levels)
      .values({
        id: pilot.level.id,
        lessonId: pilot.lesson.id,
        slug: pilot.level.slug,
        sortOrder: 1,
      })
      .onConflictDoNothing();

    await transaction
      .insert(levelVersions)
      .values({
        id: pilot.level.versionId,
        levelId: pilot.level.id,
        lessonVersionId: pilot.lesson.versionId,
        version: 1,
        locale: "en",
        title: pilot.level.title,
        publicSummary: pilot.level.publicSummary,
        instructions: pilot.level.instructions,
        estimatedMinutes: pilot.level.estimatedMinutes,
        state: "approved",
        indexPolicy: "noindex",
        reviewedAt: pilot.reviewedAt,
        publishedAt: null,
      })
      .onConflictDoNothing();

    await transaction
      .insert(learningObjectives)
      .values({
        id: pilot.objective.id,
        levelVersionId: pilot.level.versionId,
        code: pilot.objective.code,
        statement: pilot.objective.statement,
        assessable: true,
        sortOrder: 1,
      })
      .onConflictDoNothing();

    for (const [challengeIndex, challenge] of pilot.challenges.entries()) {
      await transaction
        .insert(challenges)
        .values({
          id: challenge.id,
          levelId: pilot.level.id,
          slug: challenge.slug,
          sortOrder: challengeIndex + 1,
        })
        .onConflictDoNothing();

      await transaction
        .insert(challengeVersions)
        .values({
          id: challenge.versionId,
          challengeId: challenge.id,
          levelVersionId: pilot.level.versionId,
          version: 1,
          locale: "en",
          type: challenge.type,
          prompt: challenge.prompt,
          instruction: challenge.instruction,
          explanation: challenge.explanation,
          publicPayload: challenge.publicPayload,
          points: challenge.points,
          state: "approved",
          reviewedAt: pilot.reviewedAt,
          publishedAt: null,
        })
        .onConflictDoNothing();

      await transaction
        .insert(challengeAnswerOptions)
        .values(
          challenge.options.map((option) => ({
            id: option.id,
            challengeVersionId: challenge.versionId,
            optionKey: option.key,
            label: option.label,
            sortOrder: option.sortOrder,
          })),
        )
        .onConflictDoNothing();

      await transaction
        .insert(challengeEvaluations)
        .values({
          challengeVersionId: challenge.versionId,
          evaluator: "deterministic_v1",
          privateEvaluation: challenge.privateEvaluation,
        })
        .onConflictDoNothing();

      await transaction
        .update(challengeVersions)
        .set({ state: "published", publishedAt: pilot.reviewedAt })
        .where(eq(challengeVersions.id, challenge.versionId));
    }

    await transaction
      .insert(contentSourceReferences)
      .values({
        id: pilot.source.id,
        levelVersionId: pilot.level.versionId,
        kind: "internal_editorial",
        title: pilot.source.title,
        locator: pilot.source.locator,
        sortOrder: 1,
      })
      .onConflictDoNothing();

    await transaction
      .update(levelVersions)
      .set({ state: "published", publishedAt: pilot.reviewedAt })
      .where(eq(levelVersions.id, pilot.level.versionId));

    const publicationRecords = [
      {
        entityType: "skill_category_version",
        entityVersionId: pilot.category.versionId,
        canonicalPath: "/en/skills/career-readiness",
        indexPolicy: "index" as const,
      },
      {
        entityType: "skill_version",
        entityVersionId: pilot.skill.versionId,
        canonicalPath: "/en/skills/interview-workplace-communication",
        indexPolicy: "index" as const,
      },
      {
        entityType: "learning_path_version",
        entityVersionId: pilot.path.versionId,
        canonicalPath: "/en/courses/interview-workplace-communication-foundations",
        indexPolicy: "index" as const,
      },
      {
        entityType: "module_version",
        entityVersionId: pilot.module.versionId,
        canonicalPath: "/en/learn/interview-workplace-communication-foundations/interview-evidence",
        indexPolicy: "noindex" as const,
      },
      {
        entityType: "lesson_version",
        entityVersionId: pilot.lesson.versionId,
        canonicalPath:
          "/en/learn/interview-workplace-communication-foundations/interview-evidence/strong-evidence-answers",
        indexPolicy: "noindex" as const,
      },
      {
        entityType: "level_version",
        entityVersionId: pilot.level.versionId,
        canonicalPath:
          "/en/learn/interview-workplace-communication-foundations/interview-evidence/strong-evidence-answers/show-dont-claim",
        indexPolicy: "noindex" as const,
      },
      ...pilot.challenges.map((challenge) => ({
        entityType: "challenge_version",
        entityVersionId: challenge.versionId,
        canonicalPath:
          "/en/learn/interview-workplace-communication-foundations/interview-evidence/strong-evidence-answers/show-dont-claim",
        indexPolicy: "noindex" as const,
      })),
    ];

    await transaction
      .insert(contentPublicationRecords)
      .values(
        publicationRecords.map((record) => ({
          ...record,
          state: "published" as const,
          reviewedAt: pilot.reviewedAt,
          publishedAt: pilot.reviewedAt,
        })),
      )
      .onConflictDoNothing();
  });

  console.log(
    `SkillUp launch catalog and reviewed pilot learning hierarchy are present (${launchCatalogSeed.length} skills, ${pilotLearningSeed.challenges.length} pilot challenges).`,
  );
} finally {
  await client.close();
}
