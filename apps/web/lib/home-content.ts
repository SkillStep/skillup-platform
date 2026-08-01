import { publicSkills } from "./public-catalog";

export type LaunchPath = Readonly<{
  slug: string;
  title: string;
  summary: string;
  status: "pilot" | "launch";
  levelId?: string;
}>;

export const launchPaths: readonly LaunchPath[] = publicSkills.map((skill) => ({
  slug: skill.slug,
  title: skill.title,
  summary: skill.summary,
  status: skill.status,
  ...(skill.levelId ? { levelId: skill.levelId } : {}),
}));

export function featuredPath(): LaunchPath {
  const pilot = launchPaths.find((path) => path.status === "pilot");
  if (!pilot) throw new Error("A reviewed pilot path is required.");
  return pilot;
}
