export type ProgressTier = "free" | "premium";
export type LeaderboardPeriod = "week" | "month" | "all_time";
export type StreakEventType = "qualified" | "grace";

export type ProgressCapabilities = Readonly<{
  tier: ProgressTier;
  detailedLevelHistory: boolean;
  ledgerHistoryLimit: number;
  levelHistoryLimit: number;
  leaderboardAccess: boolean;
}>;

export type StreakSnapshot = Readonly<{
  currentDays: number;
  longestDays: number;
  lastQualifiedDate: string | null;
  graceCredits: number;
}>;

export type StreakTransition = Readonly<{
  currentDays: number;
  longestDays: number;
  lastQualifiedDate: string;
  graceCredits: number;
  eventType: StreakEventType;
  changed: boolean;
  explanation: string;
}>;

export function progressCapabilities(tier: ProgressTier): ProgressCapabilities {
  if (tier === "premium") {
    return {
      tier,
      detailedLevelHistory: true,
      ledgerHistoryLimit: 200,
      levelHistoryLimit: 100,
      leaderboardAccess: true,
    };
  }

  return {
    tier,
    detailedLevelHistory: false,
    ledgerHistoryLimit: 20,
    levelHistoryLimit: 3,
    leaderboardAccess: true,
  };
}

export function isValidTimeZone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date(0));
    return true;
  } catch {
    return false;
  }
}

export function localDateFor(instant: Date, timezone: string): string {
  if (!isValidTimeZone(timezone)) throw new Error("A valid IANA timezone is required.");

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const values = new Map(parts.map((part) => [part.type, part.value]));
  const year = values.get("year");
  const month = values.get("month");
  const day = values.get("day");
  if (!year || !month || !day) throw new Error("The local calendar date could not be resolved.");
  return `${year}-${month}-${day}`;
}

function calendarDayNumber(localDate: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(localDate);
  if (!match) throw new Error("A local date must use YYYY-MM-DD.");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
}

export function applyQualifiedActivity(
  snapshot: StreakSnapshot,
  localDate: string,
): StreakTransition {
  if (!snapshot.lastQualifiedDate) {
    return {
      currentDays: 1,
      longestDays: Math.max(snapshot.longestDays, 1),
      lastQualifiedDate: localDate,
      graceCredits: snapshot.graceCredits,
      eventType: "qualified",
      changed: true,
      explanation: "Your first verified learning day started a streak.",
    };
  }

  const dayGap = calendarDayNumber(localDate) - calendarDayNumber(snapshot.lastQualifiedDate);
  if (dayGap <= 0) {
    return {
      ...snapshot,
      lastQualifiedDate: snapshot.lastQualifiedDate,
      eventType: "qualified",
      changed: false,
      explanation: "This local day was already counted, so the streak was not increased again.",
    };
  }

  if (dayGap === 1) {
    const currentDays = snapshot.currentDays + 1;
    return {
      currentDays,
      longestDays: Math.max(snapshot.longestDays, currentDays),
      lastQualifiedDate: localDate,
      graceCredits: snapshot.graceCredits,
      eventType: "qualified",
      changed: true,
      explanation: "Verified activity on the next local day extended your streak.",
    };
  }

  if (dayGap === 2 && snapshot.graceCredits > 0) {
    const currentDays = snapshot.currentDays + 1;
    return {
      currentDays,
      longestDays: Math.max(snapshot.longestDays, currentDays),
      lastQualifiedDate: localDate,
      graceCredits: snapshot.graceCredits - 1,
      eventType: "grace",
      changed: true,
      explanation: "One grace credit covered a single missed local day and preserved your streak.",
    };
  }

  return {
    currentDays: 1,
    longestDays: Math.max(snapshot.longestDays, 1),
    lastQualifiedDate: localDate,
    graceCredits: snapshot.graceCredits,
    eventType: "qualified",
    changed: true,
    explanation:
      "The previous streak ended after missed local days, and verified activity started a new one.",
  };
}

export function leaderboardPeriodStart(period: LeaderboardPeriod, now: Date): Date | null {
  if (period === "all_time") return null;
  if (period === "month") {
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  }

  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = start.getUTCDay();
  const daysSinceMonday = day === 0 ? 6 : day - 1;
  start.setUTCDate(start.getUTCDate() - daysSinceMonday);
  return start;
}
