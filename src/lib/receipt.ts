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
  if (donation.txn_id) lines.push(pair("Txn ID", donation.txn_id, w));
  lines.push(
    pair("Date", new Date(donation.created_at).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" }), w),
  );
  lines.push(pair("Donor", donation.donor_name.slice(0, w - 8), w));
  if (settings.show_phone && donation.donor_phone) lines.push(pair("Phone", donation.donor_phone, w));
  if (settings.show_lane) lines.push(pair("Lane", donation.lane, w));
  if (settings.show_collector && donation.collected_by_name)
    lines.push(pair("Collector", donation.collected_by_name.slice(0, w - 12), w));
  lines.push(pair("Mode", donation.payment_mode === "cash" ? "CASH" : "ONLINE (UPI)", w));
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

/** Plain WhatsApp message body summarising a receipt. */
export function buildWhatsappText(donation: Donation, settings: ReceiptSettings): string {
  const date = new Date(donation.created_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
  const parts = [
    `*${settings.mandal_name}*`,
    settings.header_text || "",
    "",
    `Receipt No: #${donation.receipt_no}`,
    donation.txn_id ? `Txn ID: ${donation.txn_id}` : "",
    `Date: ${date}`,
    `Donor: ${donation.donor_name}`,
    `Lane: ${donation.lane}`,
    `Mode: ${donation.payment_mode === "cash" ? "Cash" : "Online (UPI)"}`,
    donation.upi_ref ? `UPI Ref: ${donation.upi_ref}` : "",
    `Amount: Rs. ${Number(donation.amount).toFixed(2)}`,
    `Status: ${donation.status === "paid" ? "PAID" : "PENDING"}`,
    "",
    settings.footer_text || "",
    "Thank you for your support!",
  ];
  return parts.filter((l) => l !== "").join("\n");
}

/** Normalise an Indian phone number for wa.me (10 digits get the 91 country code). */
export function waPhone(phone: string | null): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (digits.length === 10) return `91${digits}`;
  if (digits.length >= 11 && digits.length <= 15) return digits;
  return null;
}

/** wa.me deep link that opens WhatsApp with the receipt pre-filled. */
export function buildWhatsappLink(donation: Donation, settings: ReceiptSettings): string | null {
  const phone = waPhone(donation.donor_phone);
  if (!phone) return null;
  return `https://wa.me/${phone}?text=${encodeURIComponent(buildWhatsappText(donation, settings))}`;
}

