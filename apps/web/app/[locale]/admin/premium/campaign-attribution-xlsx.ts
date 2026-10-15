import type { CampaignCsvSource } from "./campaign-attribution-csv";
import { buildCampaignAttributionCsv } from "./campaign-attribution-csv";

/**
 * Build a SpreadsheetML workbook Excel opens as .xls with alternating grey/white rows.
 * Avoids a heavyweight Excel dependency while preserving visible formatting.
 */
export function buildCampaignAttributionSpreadsheetXml(campaign: CampaignCsvSource): string {
  const csv = buildCampaignAttributionCsv(campaign);
  const rows = csv
    .trimEnd()
    .split("\n")
    .map((line) => {
      const cells: string[] = [];
      let current = "";
      let inQuotes = false;
      for (let i = 0; i < line.length; i += 1) {
        const char = line[i] ?? "";
        if (char === '"') {
          if (inQuotes && line[i + 1] === '"') {
            current += '"';
            i += 1;
          } else {
            inQuotes = !inQuotes;
          }
          continue;
        }
        if (char === "," && !inQuotes) {
          cells.push(current);
          current = "";
          continue;
        }
        current += char;
      }
      cells.push(current);
      return cells;
    });

  const escapeXml = (value: string) =>
    value
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");

  const xmlRows = rows
    .map((cells, index) => {
      const style = index === 0 ? "Header" : index % 2 === 0 ? "Even" : "Odd";
      const cellXml = cells
        .map(
          (cell) =>
            `<Cell ss:StyleID="${style}"><Data ss:Type="String">${escapeXml(cell)}</Data></Cell>`,
        )
        .join("");
      return `<Row>${cellXml}</Row>`;
    })
    .join("");

  return `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Styles>
  <Style ss:ID="Header">
   <Font ss:Bold="1" ss:Color="#FFFFFF"/>
   <Interior ss:Color="#181B20" ss:Pattern="Solid"/>
  </Style>
  <Style ss:ID="Odd">
   <Interior ss:Color="#FFFFFF" ss:Pattern="Solid"/>
  </Style>
  <Style ss:ID="Even">
   <Interior ss:Color="#E8EAED" ss:Pattern="Solid"/>
  </Style>
 </Styles>
 <Worksheet ss:Name="Campaign">
  <Table>${xmlRows}</Table>
 </Worksheet>
</Workbook>
`;
}

export function downloadCampaignAttributionSpreadsheet(
  campaign: CampaignCsvSource,
  filename = "premium-campaign-attribution.xls",
): void {
  const xml = buildCampaignAttributionSpreadsheetXml(campaign);
  const blob = new Blob([xml], { type: "application/vnd.ms-excel;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename.endsWith(".xls") ? filename : `${filename}.xls`;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
