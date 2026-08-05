import type { Tables } from "@/integrations/supabase/types";

export type Donation = Tables<"donations">;
export type ReceiptSettings = Tables<"receipt_settings">;

/** Build a UPI intent URI with the amount locked to the value entered. */
export function buildUpiUri(opts: {
  upiId: string;
  payeeName: string;
  amount: number;
  note?: string;
}): string {
  const params = new URLSearchParams();
  params.set("pa", opts.upiId);
  params.set("pn", opts.payeeName);
  params.set("am", opts.amount.toFixed(2));
  params.set("cu", "INR");
  if (opts.note) params.set("tn", opts.note.slice(0, 50));
  return `upi://pay?${params.toString()}`;
}

const WIDTH: Record<string, number> = { "58mm": 32, "80mm": 48 };

export function charWidth(paper: string): number {
  return WIDTH[paper] ?? 32;
}

function center(text: string, width: number): string {
  const t = text.slice(0, width);
  const pad = Math.max(0, Math.floor((width - t.length) / 2));
  return " ".repeat(pad) + t;
}

function pair(left: string, right: string, width: number): string {
  const gap = Math.max(1, width - left.length - right.length);
  return left + " ".repeat(gap) + right;
}

function rule(width: number): string {
  return "-".repeat(width);
}

/** Plain-text receipt lines, shared by the on-screen preview, PDF and thermal printer. */
export function buildReceiptLines(donation: Donation, settings: ReceiptSettings): string[] {
  const w = charWidth(settings.paper_width);
  const lines: string[] = [];

  if (settings.header_text) lines.push(center(settings.header_text, w));
  lines.push(center(settings.mandal_name, w));
  if (settings.address) lines.push(center(settings.address, w));
  if (settings.contact) lines.push(center(settings.contact, w));
  lines.push(rule(w));
  lines.push(center("DONATION RECEIPT", w));
  lines.push(rule(w));
  lines.push(pair("Receipt", `#${donation.receipt_no}`, w));
  lines.push(
    pair("Date", new Date(donation.created_at).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" }), w),
  );
  lines.push(pair("Donor", donation.donor_name.slice(0, w - 8), w));
  if (settings.show_phone && donation.donor_phone) lines.push(pair("Phone", donation.donor_phone, w));
  if (settings.show_lane) lines.push(pair("Lane", donation.lane, w));
  if (settings.show_collector && donation.collected_by_name)
    lines.push(pair("Collector", donation.collected_by_name.slice(0, w - 12), w));
  if (settings.show_upi_ref && donation.upi_ref) lines.push(pair("UPI Ref", donation.upi_ref, w));
  lines.push(rule(w));
  lines.push(pair("AMOUNT", `Rs. ${Number(donation.amount).toFixed(2)}`, w));
  lines.push(pair("Status", donation.status === "paid" ? "PAID" : "PENDING", w));
  lines.push(rule(w));
  if (settings.upi_id) lines.push(center(settings.upi_id, w));
  if (settings.footer_text) lines.push(center(settings.footer_text, w));
  lines.push(center("Thank you for your support", w));
  return lines;
}
