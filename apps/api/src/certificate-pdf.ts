/**
 * No third-party PDF rendering or remote template lookups. This is a single-page
 * A4 SkillUp completion certificate. English-launch names are drawn only from
 * the immutable award snapshot; unsupported characters are rejected rather than
 * silently altered on an official completion record.
 */
export type PrintableCertificate = Readonly<{
  publicId: string;
  title: string;
  learnerName: string;
  completedAt: Date;
  issuedAt: Date;
}>;

function pdfText(value: string): string {
  if (!/^[\x20-\x7E]+$/.test(value)) {
    throw new Error(
      "The current English PDF font cannot faithfully represent this name. Contact support for a Unicode certificate.",
    );
  }
  return value.replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)");
}

function splitForDisplay(value: string, length: number): string[] {
  const words = value.trim().split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (word.length > length) throw new Error("Certificate text is too long to render safely.");
    const next = current ? `${current} ${word}` : word;
    if (next.length > length && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  if (lines.length > 3) throw new Error("Certificate text exceeds a single-page printable area.");
  return lines;
}

function centerText(y: number, value: string, size: number, bold = false): string {
  const escaped = pdfText(value);
  const estimatedWidth = value.length * size * (bold ? 0.54 : 0.49);
  const x = Math.max(38, (841.89 - estimatedWidth) / 2);
  return `BT /${bold ? "F2" : "F1"} ${size} Tf ${x.toFixed(2)} ${y} Td (${escaped}) Tj ET\n`;
}

function pdfDocument(content: string): Buffer {
  const streamLength = Buffer.byteLength(content, "ascii");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 841.89 595.28] /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${streamLength} >>\nstream\n${content}endstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
  ];
  let result = "%PDF-1.4\n%SkillUp\n";
  const offsets = [0];
  for (const [index, obj] of objects.entries()) {
    offsets.push(Buffer.byteLength(result, "ascii"));
    result += `${index + 1} 0 obj\n${obj}\nendobj\n`;
  }
  const xref = Buffer.byteLength(result, "ascii");
  result += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) {
    result += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  result += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(result, "ascii");
}

export function renderSkillCertificatePdf(award: PrintableCertificate): Buffer {
  const fullTitle = award.title.replace(/^Certificate of Completion\s*[-—:]\s*/, "").trim();
  const courseLines = splitForDisplay(fullTitle, 48);
  const personLines = splitForDisplay(award.learnerName, 28);
  pdfText(award.publicId);
  for (const value of [...courseLines, ...personLines]) pdfText(value);

  const completed = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(award.completedAt);
  const issued = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(award.issuedAt);

  // ISO A4 landscape: 841.89 x 595.28 pt. All text fits the printable frame.
  let stream = "";
  stream += "q\n0.066 0.098 0.188 rg\n0 0 841.89 595.28 re f\n";
  stream += "0.950 0.936 0.902 rg\n22 22 797.89 551.28 re f\n";
  stream += "0.298 0.184 0.650 rg\n22 22 9 551.28 re f\n";
  stream += "0.087 0.122 0.234 rg\n";
  stream += centerText(532, "S K I L L U P", 22, true);
  stream += centerText(505, "LEARN  /  PRACTISE  /  LEVEL UP", 10);
  stream += "0.28 0.18 0.64 RG\n1.5 w\n177 482 m 665 482 l S\n";
  stream += "0.087 0.122 0.234 rg\n";
  stream += centerText(439, "CERTIFICATE", 30, true);
  stream += centerText(410, "OF COMPLETION", 16);
  stream += centerText(370, "This certificate is awarded to", 11);
  for (const [i, person] of personLines.entries()) {
    stream += centerText(335 - i * 28, person, 25, true);
  }
  stream += centerText(246, "Successfully completed the SkillUp learning path in", 11);
  for (const [i, title] of courseLines.entries()) {
    stream += centerText(218 - i * 22, title, 16, true);
  }
  stream += "0.28 0.18 0.64 RG\n0.8 w\n149 152 m 692 152 l S\n";
  stream += "0.087 0.122 0.234 rg\n";
  stream += centerText(132, `Completed: ${completed}  |  Issued: ${issued}`, 10);
  stream += centerText(
    103,
    "SkillUp educational completion certificate — not an accredited professional qualification.",
    9,
  );
  stream += centerText(78, `Certificate ID: ${award.publicId}`, 9);
  stream += centerText(58, "Certificate records are available privately in the learner's SkillUp account.", 9);
  stream += "Q\n";

  return pdfDocument(stream);
}
