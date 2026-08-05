import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

import { formatDateTime } from "./lanes";
import { buildReceiptLines, charWidth, type Donation, type ReceiptSettings } from "./receipt";

/** Single receipt as a narrow, thermal-sized PDF. */
export function downloadReceiptPdf(donation: Donation, settings: ReceiptSettings) {
  const lines = buildReceiptLines(donation, settings);
  const widthMm = settings.paper_width === "80mm" ? 80 : 58;
  const lineHeight = 4.4;
  const heightMm = 16 + lines.length * lineHeight;

  const doc = new jsPDF({ unit: "mm", format: [widthMm, heightMm] });
  doc.setFont("courier", "normal");
  doc.setFontSize(settings.paper_width === "80mm" ? 9 : 8);

  let y = 8;
  for (const line of lines) {
    doc.text(line, 3, y);
    y += lineHeight;
  }
  doc.save(`receipt-${donation.receipt_no}.pdf`);
}

/** Full ledger with per-lane subtotals and a grand total. */
export function downloadLedgerPdf(
  donations: Donation[],
  settings: ReceiptSettings,
  meta: { rangeLabel: string },
) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text(settings.mandal_name, 14, 16);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text("Ganesh Utsav donation ledger", 14, 22);
  doc.text(meta.rangeLabel, 14, 27);
  doc.text(`Generated ${formatDateTime(new Date().toISOString())}`, 14, 32);

  autoTable(doc, {
    startY: 38,
    head: [["Receipt", "Date", "Donor", "Phone", "Lane", "Status", "UPI Ref", "Amount (Rs.)"]],
    body: donations.map((d) => [
      `#${d.receipt_no}`,
      formatDateTime(d.created_at),
      d.donor_name,
      d.donor_phone ?? "-",
      d.lane,
      d.status === "paid" ? "Paid" : "Pending",
      d.upi_ref ?? "-",
      Number(d.amount).toFixed(2),
    ]),
    styles: { fontSize: 8, cellPadding: 1.5 },
    headStyles: { fillColor: [214, 122, 32] },
    columnStyles: { 7: { halign: "right" } },
  });

  const laneTotals = new Map<string, number>();
  for (const d of donations) laneTotals.set(d.lane, (laneTotals.get(d.lane) ?? 0) + Number(d.amount));
  const grand = donations.reduce((sum, d) => sum + Number(d.amount), 0);

  const afterTable = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  autoTable(doc, {
    startY: afterTable,
    head: [["Lane", "Donations", "Total (Rs.)"]],
    body: [...laneTotals.entries()].map(([lane, total]) => [
      lane,
      String(donations.filter((d) => d.lane === lane).length),
      total.toFixed(2),
    ]),
    foot: [["Grand total", String(donations.length), grand.toFixed(2)]],
    styles: { fontSize: 9, cellPadding: 1.8 },
    headStyles: { fillColor: [214, 122, 32] },
    footStyles: { fillColor: [60, 40, 20], textColor: 255 },
    columnStyles: { 2: { halign: "right" } },
  });

  doc.save(`donation-ledger-${new Date().toISOString().slice(0, 10)}.pdf`);
}

/** Browser print fallback for the same receipt layout. */
export function browserPrintReceipt(donation: Donation, settings: ReceiptSettings) {
  const lines = buildReceiptLines(donation, settings);
  const width = settings.paper_width;
  const cols = charWidth(width);
  const win = window.open("", "_blank", "width=400,height=700");
  if (!win) return;
  win.document.write(`<!doctype html><html><head><title>Receipt ${donation.receipt_no}</title>
  <style>
    @page { size: ${width} auto; margin: 2mm; }
    body { font-family: "Courier New", monospace; font-size: ${width === "80mm" ? 12 : 11}px; white-space: pre; margin: 0; }
    pre { margin: 0; width: ${cols}ch; }
  </style></head><body><pre>${lines
    .join("\n")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")}</pre>
  <script>window.onload = function () { window.print(); };<\/script>
  </body></html>`);
  win.document.close();
}
