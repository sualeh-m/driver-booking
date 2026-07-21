import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";
import { LOGO_DATA_URL, LOGO_WIDTH_PX, LOGO_HEIGHT_PX } from "./reportLogo";

const LOGO_ASPECT = LOGO_WIDTH_PX / LOGO_HEIGHT_PX;

// Everything the export needs, captured from the Reports page's CURRENT
// filter state and already-fetched metric data — what you see is what exports.
export interface ReportExportModel {
  rangeLabel: string;
  coverage: string[]; // depot/client lines covered by the current filter
  workerType: string; // "All" | "HGV" | "Warehouse"
  operational: { label: string; value: string }[];
  people: { label: string; value: string }[];
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

  const navy = "FF1E3A5F";
  const lightFill = "FFEBEFF5";

  const titleRow = ws.getRow(r++);
  titleRow.getCell(1).value = "ShiftControl — KPI Report";
  titleRow.getCell(1).font = { bold: true, size: 14, color: { argb: navy } };

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
// PDF — polished, client-ready document with the company logo top-right.
// ---------------------------------------------------------------------------
export function exportReportPdf(model: ReportExportModel) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 48;
  const brand: [number, number, number] = [30, 58, 95]; // deep navy
  const light: [number, number, number] = [120, 128, 140];

  // Company logo (top-right), proportions preserved.
  const logoW = 132;
  const logoH = logoW / LOGO_ASPECT;
  doc.addImage(
    LOGO_DATA_URL,
    "JPEG",
    pageW - margin - logoW,
    margin - 8,
    logoW,
    logoH,
  );

  // Title block.
  doc.setTextColor(...brand);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text("KPI Report", margin, margin + 12);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(60, 66, 76);
  doc.text("ShiftControl — Workforce performance summary", margin, margin + 30);

  // Meta lines: coverage, range, worker type, generated date.
  let y = margin + 58;
  doc.setFontSize(9.5);
  const meta: [string, string][] = [
    ["Coverage", model.coverage.join("; ")],
    ["Date range", model.rangeLabel],
    ["Worker type", model.workerType],
    ["Report generated", generatedAt()],
  ];
  for (const [k, v] of meta) {
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...brand);
    doc.text(`${k}:`, margin, y);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(60, 66, 76);
    const wrapped = doc.splitTextToSize(v, pageW - margin * 2 - 110);
    doc.text(wrapped, margin + 110, y);
    y += 14 * wrapped.length;
  }
  y += 6;
  doc.setDrawColor(...brand);
  doc.setLineWidth(1.5);
  doc.line(margin, y, pageW - margin, y);
  y += 18;

  const section = (
    title: string,
    head: [string, string],
    rows: { label: string; value: string }[],
  ) => {
    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [[{ content: title, colSpan: 2 }], head],
      body: rows.map((r) => [r.label, r.value]),
      theme: "grid",
      styles: { fontSize: 9.5, cellPadding: 6, textColor: [50, 56, 66] },
      headStyles: { fillColor: brand, textColor: 255, fontStyle: "bold" },
      columnStyles: { 1: { halign: "right", cellWidth: 120 } },
      didParseCell: (data) => {
        // Second header row (Metric/Value) rendered lighter.
        if (data.section === "head" && data.row.index === 1) {
          data.cell.styles.fillColor = [235, 239, 245];
          data.cell.styles.textColor = brand;
        }
      },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable
      .finalY + 20;
  };

  section("Operational", ["Metric", "Value"], model.operational);
  section("People", ["Metric", "Value"], model.people);
  section(
    `Leaver reasons (total ${model.leaversTotal})`,
    ["Reason", "Count"],
    model.leaverReasons,
  );
  section(
    "Retention by length of service (current snapshot)",
    ["Length of service", "Workers"],
    model.retention,
  );

  // Footer with page numbers.
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(...light);
    doc.text(
      `ShiftControl KPI Report · ${model.rangeLabel}`,
      margin,
      doc.internal.pageSize.getHeight() - 24,
    );
    doc.text(
      `Page ${i} of ${pages}`,
      pageW - margin,
      doc.internal.pageSize.getHeight() - 24,
      { align: "right" },
    );
  }

  doc.save(`kpi-report-${fileStamp()}.pdf`);
}
