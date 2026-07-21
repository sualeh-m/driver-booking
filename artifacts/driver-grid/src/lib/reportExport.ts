import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";

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
// CSV (opens cleanly in Excel) — title/filters at the top, then each section.
// ---------------------------------------------------------------------------
export function exportReportCsv(model: ReportExportModel) {
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const row = (...cells: string[]) => cells.map(esc).join(",");
  const lines: string[] = [];

  lines.push(row("ShiftControl — KPI Report"));
  lines.push(row("Coverage", model.coverage.join("; ")));
  lines.push(row("Date range", model.rangeLabel));
  lines.push(row("Worker type", model.workerType));
  lines.push(row("Report generated", generatedAt()));
  lines.push("");

  lines.push(row("OPERATIONAL"));
  lines.push(row("Metric", "Value"));
  for (const m of model.operational) lines.push(row(m.label, m.value));
  lines.push("");

  lines.push(row("PEOPLE"));
  lines.push(row("Metric", "Value"));
  for (const m of model.people) lines.push(row(m.label, m.value));
  lines.push("");

  lines.push(row(`LEAVER REASONS (total ${model.leaversTotal})`));
  lines.push(row("Reason", "Count"));
  for (const m of model.leaverReasons) lines.push(row(m.label, m.value));
  lines.push("");

  lines.push(row("RETENTION BY LENGTH OF SERVICE (current snapshot)"));
  lines.push(row("Length of service", "Workers"));
  for (const m of model.retention) lines.push(row(m.label, m.value));

  // BOM so Excel opens it as UTF-8 (em dashes in sheet names etc.).
  const blob = new Blob(["\uFEFF" + lines.join("\r\n")], {
    type: "text/csv;charset=utf-8",
  });
  downloadBlob(blob, `kpi-report-${fileStamp()}.csv`);
}

// ---------------------------------------------------------------------------
// PDF — polished, client-ready document with a logo placeholder.
// ---------------------------------------------------------------------------
export function exportReportPdf(model: ReportExportModel) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 48;
  const brand: [number, number, number] = [30, 58, 95]; // deep navy
  const light: [number, number, number] = [120, 128, 140];

  // Logo placeholder box (top-right) — swap for a real logo later.
  const logoW = 110;
  const logoH = 44;
  doc.setDrawColor(200, 205, 212);
  doc.setLineWidth(1);
  doc.roundedRect(pageW - margin - logoW, margin - 8, logoW, logoH, 4, 4);
  doc.setFontSize(9);
  doc.setTextColor(...light);
  doc.text("Company logo", pageW - margin - logoW / 2, margin - 8 + logoH / 2 + 3, {
    align: "center",
  });

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
