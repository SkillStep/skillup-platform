export type CampaignCsvSource = Readonly<{
  detailed: Readonly<{
    platformByParameter: readonly Readonly<{
      date: string;
      platform: string;
      parameter: string;
      subscriptions: number;
    }>[];
    packageByParameter: readonly Readonly<{
      date: string;
      package: string;
      parameter: string;
      subscriptions: number;
    }>[];
  }>;
  daily: readonly Readonly<{
    date: string;
    byPlatform: Readonly<Record<string, number>>;
    byPackage: Readonly<Record<string, number>>;
    byParameter: Readonly<Record<string, number>>;
  }>[];
}>;

function csvCell(value: string | number): string {
  const raw = String(value ?? "");
  if (/[",\n\r]/.test(raw)) return `"${raw.replaceAll('"', '""')}"`;
  return raw;
}

function emptyIfNone(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "none" || trimmed === "unknown") return "";
  return trimmed;
}

/**
 * CSV shape matching Maidan / spreadsheet export:
 * date,view,platform,parameter,package,count
 */
export function buildCampaignAttributionCsv(campaign: CampaignCsvSource): string {
  const lines = ["date,view,platform,parameter,package,count"];

  for (const row of campaign.detailed.platformByParameter) {
    lines.push(
      [
        csvCell(row.date),
        csvCell("platform_parameter"),
        csvCell(emptyIfNone(row.platform)),
        csvCell(emptyIfNone(row.parameter)),
        csvCell(""),
        csvCell(row.subscriptions),
      ].join(","),
    );
  }

  for (const row of campaign.detailed.packageByParameter) {
    lines.push(
      [
        csvCell(row.date),
        csvCell("package_parameter"),
        csvCell(""),
        csvCell(emptyIfNone(row.parameter)),
        csvCell(emptyIfNone(row.package)),
        csvCell(row.subscriptions),
      ].join(","),
    );
  }

  for (const day of campaign.daily) {
    for (const [platform, count] of Object.entries(day.byPlatform)) {
      const label = emptyIfNone(platform);
      if (!label) continue;
      lines.push(
        [
          csvCell(day.date),
          csvCell("platform"),
          csvCell(label),
          csvCell(""),
          csvCell(""),
          csvCell(count),
        ].join(","),
      );
    }
    for (const [pkg, count] of Object.entries(day.byPackage)) {
      const label = emptyIfNone(pkg);
      if (!label) continue;
      lines.push(
        [
          csvCell(day.date),
          csvCell("package"),
          csvCell(""),
          csvCell(""),
          csvCell(label),
          csvCell(count),
        ].join(","),
      );
    }
    for (const [parameter, count] of Object.entries(day.byParameter)) {
      const label = emptyIfNone(parameter);
      if (!label) continue;
      lines.push(
        [
          csvCell(day.date),
          csvCell("parameter"),
          csvCell(""),
          csvCell(label),
          csvCell(""),
          csvCell(count),
        ].join(","),
      );
    }
  }

  return `${lines.join("\n")}\n`;
}

export function downloadCampaignAttributionCsv(
  campaign: CampaignCsvSource,
  filename = "premium-campaign-attribution.csv",
): void {
  const csv = buildCampaignAttributionCsv(campaign);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
