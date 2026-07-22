import { jsPDF } from "jspdf";
import { format } from "date-fns";
import { LOGO_DATA_URL, LOGO_WIDTH_PX, LOGO_HEIGHT_PX } from "./reportLogo";

const LOGO_ASPECT = LOGO_WIDTH_PX / LOGO_HEIGHT_PX;

// Everything the export needs, captured from the Reports page's CURRENT
// filter state and already-fetched metric data — what you see is what exports.
export interface ReportExportModel {
  rangeLabel: string; // always "DD.MM.YYYY - DD.MM.YYYY"
  coverage: string[]; // depot/client lines covered by the current filter
  workerType: string; // actual worker types included, e.g. "HGV and Warehouse"
  operational: { label: string; value: string; hint?: string }[];
  people: { label: string; value: string; hint?: string }[]; // CPC/Test omitted when HGV excluded
  leaverReasons: { label: string; value: string }[];
  leaversTotal: string;
  retention: { label: string; value: string }[];
}

const generatedAt = () => format(new Date(), "d MMMM yyyy, HH:mm");

function fileStamp(): string {
  return format(new Date(), "yyyy-MM-dd");
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Excel (.xlsx) — branded workbook with the company logo in the header,
// then title/filters and each metric section. exceljs is imported lazily so
// it only loads when an export is actually requested.
// ---------------------------------------------------------------------------
export async function exportReportExcel(model: ReportExportModel) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("KPI Report", {
    properties: { defaultRowHeight: 16 },
  });
  ws.getColumn(1).width = 44;
  ws.getColumn(2).width = 20;

  // Logo top-left, sized for a header (~220px wide), proportions preserved.
  const logoDisplayW = 220;
  const logoDisplayH = Math.round(logoDisplayW / LOGO_ASPECT);
  const imgId = wb.addImage({ base64: LOGO_DATA_URL, extension: "jpeg" });
  ws.addImage(imgId, {
    tl: { col: 0, row: 0 },
    ext: { width: logoDisplayW, height: logoDisplayH },
    editAs: "oneCell",
  });
  // Reserve rows for the logo so content starts below it.
  const logoRows = Math.ceil(logoDisplayH / 20) + 1;
  let r = logoRows + 1;

  const navy = "FF1B2A4A";
  const gold = "FFBF9854";
  const lightFill = "FFF4F6FA";

  const titleRow = ws.getRow(r++);
  titleRow.getCell(1).value = "ShiftControl — KPI Report";
  titleRow.getCell(1).font = { bold: true, size: 14, color: { argb: navy } };
  for (const c of [1, 2]) {
    titleRow.getCell(c).border = {
      bottom: { style: "medium", color: { argb: gold } },
    };
  }

  const meta: [string, string][] = [
    ["Coverage", model.coverage.join("; ")],
    ["Date range", model.rangeLabel],
    ["Worker type", model.workerType],
    ["Report generated", generatedAt()],
  ];
  for (const [k, v] of meta) {
    const row = ws.getRow(r++);
    row.getCell(1).value = k;
    row.getCell(1).font = { bold: true, color: { argb: navy } };
    row.getCell(2).value = v;
  }
  r++;

  const section = (
    title: string,
    head: [string, string],
    rows: { label: string; value: string }[],
  ) => {
    const titleRow = ws.getRow(r++);
    titleRow.getCell(1).value = title;
    titleRow.getCell(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    for (const c of [1, 2]) {
      titleRow.getCell(c).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: navy },
      };
      titleRow.getCell(c).border = {
        bottom: { style: "medium", color: { argb: gold } },
      };
    }
    const headRow = ws.getRow(r++);
    head.forEach((h, i) => {
      const cell = headRow.getCell(i + 1);
      cell.value = h;
      cell.font = { bold: true, color: { argb: navy } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: lightFill } };
    });
    for (const m of rows) {
      const row = ws.getRow(r++);
      row.getCell(1).value = m.label;
      row.getCell(2).value = m.value;
      row.getCell(2).alignment = { horizontal: "right" };
    }
    r++;
  };

  section("OPERATIONAL", ["Metric", "Value"], model.operational);
  section("PEOPLE", ["Metric", "Value"], model.people);
  section(
    `LEAVER REASONS (total ${model.leaversTotal})`,
    ["Reason", "Count"],
    model.leaverReasons,
  );
  section(
    "RETENTION BY LENGTH OF SERVICE (current snapshot)",
    ["Length of service", "Workers"],
    model.retention,
  );

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  downloadBlob(blob, `kpi-report-${fileStamp()}.xlsx`);
}

// ---------------------------------------------------------------------------
// PDF — designed, on-brand (navy + gold) client-ready report: branded header,
// KPI stat cards mirroring the on-screen Reports page, styled breakdown tables.
// ---------------------------------------------------------------------------
const NAVY: [number, number, number] = [27, 42, 74];
const GOLD: [number, number, number] = [191, 152, 84];
const INK: [number, number, number] = [55, 62, 74];
const MUTED: [number, number, number] = [120, 128, 140];
const CARD_BORDER: [number, number, number] = [222, 226, 233];
const PANEL_BG: [number, number, number] = [244, 246, 250];

export function exportReportPdf(model: ReportExportModel) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 48;
  const contentW = pageW - margin * 2;

  // ----- Header: title left, logo top-right, gold accent rule ------------
  const logoW = 128;
  const logoH = logoW / LOGO_ASPECT;
  doc.addImage(LOGO_DATA_URL, "JPEG", pageW - margin - logoW, margin - 10, logoW, logoH);

  doc.setTextColor(...NAVY);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.text("KPI Report", margin, margin + 12);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10.5);
  doc.setTextColor(...MUTED);
  doc.text("ShiftControl · Workforce performance summary", margin, margin + 30);

  // Gold accent under the title, navy hairline across the rest.
  const ruleY = margin + 44;
  doc.setDrawColor(...GOLD);
  doc.setLineWidth(3);
  doc.line(margin, ruleY, margin + 64, ruleY);
  doc.setDrawColor(...CARD_BORDER);
  doc.setLineWidth(0.75);
  doc.line(margin + 72, ruleY, pageW - margin, ruleY);

  // ----- Meta panel: soft navy-tinted box with gold edge -----------------
  // Cap very large depot/client selections so the header stays compact.
  const maxCoverage = 8;
  const coverageText =
    model.coverage.length > maxCoverage
      ? `${model.coverage.slice(0, maxCoverage).join("; ")} (+${model.coverage.length - maxCoverage} more)`
      : model.coverage.join("; ");
  const meta: [string, string][] = [
    ["Coverage", coverageText],
    ["Date range", model.rangeLabel],
    ["Worker type", model.workerType],
    ["Report generated", generatedAt()],
  ];
  const metaTextW = contentW - 24 - 110;
  const metaLines = meta.map(([k, v]) => [k, doc.splitTextToSize(v, metaTextW)] as const);
  const metaLineH = 14;
  const panelPad = 12;
  const panelH =
    panelPad * 2 + metaLines.reduce((h, [, w]) => h + w.length * metaLineH, 0) - 4;
  let y = ruleY + 16;
  doc.setFillColor(...PANEL_BG);
  doc.roundedRect(margin, y, contentW, panelH, 4, 4, "F");
  doc.setFillColor(...GOLD);
  doc.rect(margin, y + 4, 3, panelH - 8, "F");

  let my = y + panelPad + 8;
  doc.setFontSize(9.5);
  for (const [k, wrapped] of metaLines) {
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...NAVY);
    doc.text(k.toUpperCase(), margin + 16, my);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...INK);
    doc.text(wrapped, margin + 126, my);
    my += wrapped.length * metaLineH;
  }
  y += panelH + 26;

  // ----- Helpers ----------------------------------------------------------
  const ensureRoom = (needed: number) => {
    if (y + needed > pageH - 56) {
      doc.addPage();
      y = margin;
    }
  };

  const sectionTitle = (title: string) => {
    ensureRoom(60);
    doc.setFillColor(...GOLD);
    doc.rect(margin, y - 9, 4, 13, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12.5);
    doc.setTextColor(...NAVY);
    doc.text(title.toUpperCase(), margin + 12, y + 2);
    doc.setDrawColor(...CARD_BORDER);
    doc.setLineWidth(0.75);
    doc.line(margin, y + 10, pageW - margin, y + 10);
    y += 26;
  };

  // Stat cards mirroring the on-screen KPI tiles, in the SAME reading order
  // as the app: label on top (small, muted), big navy number underneath,
  // short description below. `perRow` cards per row, wrapping as needed.
  const statCards = (
    stats: { label: string; value: string; hint?: string }[],
    perRow: number,
  ) => {
    const gap = 10;
    const cardW = (contentW - gap * (perRow - 1)) / perRow;
    const cardH = 82;
    for (let i = 0; i < stats.length; i += perRow) {
      ensureRoom(cardH + gap);
      const rowStats = stats.slice(i, i + perRow);
      rowStats.forEach((s, j) => {
        const x = margin + j * (cardW + gap);
        doc.setFillColor(255, 255, 255);
        doc.setDrawColor(...CARD_BORDER);
        doc.setLineWidth(0.75);
        doc.roundedRect(x, y, cardW, cardH, 4, 4, "FD");
        doc.setFillColor(...GOLD);
        doc.rect(x + 10, y, cardW - 20, 2.5, "F");
        // Label first (top), like CardDescription on screen.
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7.5);
        doc.setTextColor(...MUTED);
        const label = doc
          .splitTextToSize(s.label.toUpperCase(), cardW - 24)
          .slice(0, 2) as string[];
        doc.text(label, x + 12, y + 17);
        // Big number underneath.
        doc.setFont("helvetica", "bold");
        doc.setFontSize(17);
        doc.setTextColor(...NAVY);
        doc.text(s.value, x + 12, y + 30 + label.length * 9);
        // Short description below the number.
        if (s.hint) {
          doc.setFont("helvetica", "normal");
          doc.setFontSize(6.8);
          doc.setTextColor(...MUTED);
          const hint = doc
            .splitTextToSize(s.hint, cardW - 24)
            .slice(0, 2) as string[];
          doc.text(hint, x + 12, y + 42 + label.length * 9);
        }
      });
      y += cardH + gap;
    }
    y += 12;
  };

  // Side-by-side white breakdown cards with simple label/value rows,
  // matching the on-screen "Leaver reasons" / "Retention" cards.
  interface BreakdownCard {
    title: string;
    subtitle?: string;
    rows: { label: string; value: string }[];
  }
  const breakdownCards = (cards: [BreakdownCard, BreakdownCard]) => {
    const gap = 12;
    const cardW = (contentW - gap) / 2;
    const pad = 14;
    const rowH = 17;
    const headerH = (c: BreakdownCard) => pad + 14 + (c.subtitle ? 13 : 0) + 8;
    const cardH = (c: BreakdownCard) => headerH(c) + c.rows.length * rowH + pad - 6;
    const maxH = Math.max(...cards.map(cardH));
    ensureRoom(maxH + 16);
    cards.forEach((c, idx) => {
      const x = margin + idx * (cardW + gap);
      const h = cardH(c);
      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(...CARD_BORDER);
      doc.setLineWidth(0.75);
      doc.roundedRect(x, y, cardW, h, 4, 4, "FD");
      doc.setFillColor(...GOLD);
      doc.rect(x + 10, y, cardW - 20, 2.5, "F");
      // Title + optional subtitle, like the on-screen card header.
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10.5);
      doc.setTextColor(...NAVY);
      doc.text(c.title, x + pad, y + pad + 4);
      if (c.subtitle) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7.5);
        doc.setTextColor(...MUTED);
        doc.text(
          doc.splitTextToSize(c.subtitle, cardW - pad * 2)[0] as string,
          x + pad,
          y + pad + 16,
        );
      }
      // Simple rows: label left, value right, hairline dividers.
      let ry = y + headerH(c) + 6;
      c.rows.forEach((r, i) => {
        if (i > 0) {
          doc.setDrawColor(...CARD_BORDER);
          doc.setLineWidth(0.5);
          doc.line(x + pad, ry - 11, x + cardW - pad, ry - 11);
        }
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.setTextColor(...(r.value === "0" ? MUTED : INK));
        doc.text(r.label, x + pad, ry);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...NAVY);
        doc.text(r.value, x + cardW - pad, ry, { align: "right" });
        ry += rowH;
      });
    });
    y += maxH + 24;
  };

  // ----- Sections ----------------------------------------------------------
  sectionTitle("Operational");
  statCards(model.operational, 5);

  sectionTitle("People");
  statCards(model.people, 3);

  breakdownCards([
    {
      title: `Leaver reasons (total ${model.leaversTotal})`,
      subtitle: "Leavers in range by reason",
      rows: model.leaverReasons,
    },
    {
      title: "Retention by length of service",
      subtitle: "Current snapshot, not limited to the date range",
      rows: model.retention,
    },
  ]);

  // ----- Footer: gold hairline + page numbers on every page ---------------
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setDrawColor(...GOLD);
    doc.setLineWidth(1);
    doc.line(margin, pageH - 38, pageW - margin, pageH - 38);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text(`ShiftControl KPI Report · ${model.rangeLabel}`, margin, pageH - 24);
    doc.text(`Page ${i} of ${pages}`, pageW - margin, pageH - 24, {
      align: "right",
    });
  }

  doc.save(`kpi-report-${fileStamp()}.pdf`);
}
