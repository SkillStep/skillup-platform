import { publicSkill, type PublicSkill, type PublicSkillLevel } from "./public-catalog";

type PublishedCourse = Readonly<{
  slug: string;
  title: string;
  summary: string;
  pathSlug: string;
  levelId: string;
  levelCount: number;
  moduleCount: number;
  modules: readonly string[];
  levels: readonly PublicSkillLevel[];
  outcomes: readonly string[];
  challengeTypes: readonly string[];
  estimatedMinutes: number;
}>;

const apiBase = process.env["API_BASE_URL"] ?? "http://localhost:3001";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const slug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function isPublishedLevel(value: unknown): value is PublicSkillLevel {
  if (!value || typeof value !== "object") return false;
  const level = value as Record<string, unknown>;
  return (
    typeof level["id"] === "string" &&
    uuid.test(level["id"]) &&
    typeof level["title"] === "string" &&
    level["title"].length >= 3 &&
    typeof level["moduleId"] === "string" &&
    uuid.test(level["moduleId"]) &&
    typeof level["moduleTitle"] === "string" &&
    level["moduleTitle"].length >= 3 &&
    Number.isInteger(level["estimatedMinutes"]) &&
    Number(level["estimatedMinutes"]) > 0
  );
}

function isPublishedCourse(value: unknown): value is PublishedCourse {
  if (!value || typeof value !== "object") return false;
  const course = value as Record<string, unknown>;
  return (
    typeof course["slug"] === "string" &&
    slug.test(course["slug"]) &&
    typeof course["title"] === "string" &&
    course["title"].length >= 3 &&
    typeof course["summary"] === "string" &&
    course["summary"].length >= 40 &&
    typeof course["pathSlug"] === "string" &&
    slug.test(course["pathSlug"]) &&
    typeof course["levelId"] === "string" &&
    uuid.test(course["levelId"]) &&
    Number.isInteger(course["levelCount"]) &&
    Number(course["levelCount"]) > 0 &&
    Number.isInteger(course["moduleCount"]) &&
    Number(course["moduleCount"]) > 0 &&
    Number.isInteger(course["estimatedMinutes"]) &&
    Number(course["estimatedMinutes"]) > 0 &&
    Array.isArray(course["modules"]) &&
    course["modules"].every((name: unknown) => typeof name === "string") &&
    course["modules"].length === course["moduleCount"] &&
    Array.isArray(course["levels"]) &&
    course["levels"].length === course["levelCount"] &&
    course["levels"].every(isPublishedLevel) &&
    new Set(course["levels"].map((item: PublicSkillLevel) => item.id)).size === course["levels"].length &&
    course["levels"][0]?.id === course["levelId"] &&
    course["levels"].reduce(
      (total: number, item: PublicSkillLevel) => total + item.estimatedMinutes,
      0,
    ) === course["estimatedMinutes"] &&
    Array.isArray(course["outcomes"]) &&
    course["outcomes"].every((item: unknown) => typeof item === "string") &&
    Array.isArray(course["challengeTypes"]) &&
    course["challengeTypes"].every((item: unknown) => typeof item === "string") &&
    course["challengeTypes"].length > 0
  );
}

export function projectPublishedPublicSkills(data: unknown): readonly PublicSkill[] {
  if (!data || typeof data !== "object") return [];
  const value = data as Record<string, unknown>;
  if (!Array.isArray(value["courses"])) return [];

  const courses: PublicSkill[] = [];
  const seen = new Set<string>();
  for (const candidate of value["courses"]) {
    if (!isPublishedCourse(candidate) || seen.has(candidate.slug)) continue;
    const reviewedLaunch = publicSkill(candidate.slug);
    courses.push({
      slug: candidate.slug,
      title: candidate.title,
      summary: candidate.summary,
      status: reviewedLaunch?.status ?? "launch",
      outcomes:
        candidate.outcomes.length > 0 ? candidate.outcomes : (reviewedLaunch?.outcomes ?? []),
      editorialNote: reviewedLaunch?.editorialNote ?? null,
      modules: candidate.modules,
      challengeTypes: candidate.challengeTypes,
      levelId: candidate.levelId,
      levelCount: candidate.levelCount,
      levels: candidate.levels,
      moduleCount: candidate.moduleCount,
      estimatedMinutes: candidate.estimatedMinutes,
      reviewCadence:
        reviewedLaunch?.reviewCadence ??
        "Content is updated after subject review and publication approval.",
    });
    seen.add(candidate.slug);
  }
  return courses;
}

/**
 * The API is the sole visibility authority. Network or schema failures return
 * no courses rather than presenting unverified static drafts as paid content.
 */
export async function loadPublishedPublicSkills(
  request: typeof fetch = fetch,
): Promise<readonly PublicSkill[]> {
  try {
    const response = await request(new URL("/v1/catalog/courses?locale=en", apiBase), {
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) return [];
    return projectPublishedPublicSkills(await response.json());
  } catch {
    return [];
  }
}

export async function loadPublishedPublicSkill(
  key: string,
  request: typeof fetch = fetch,
): Promise<PublicSkill | null> {
  if (!slug.test(key)) return null;
  return (await loadPublishedPublicSkills(request)).find((item) => item.slug === key) ?? null;
}
