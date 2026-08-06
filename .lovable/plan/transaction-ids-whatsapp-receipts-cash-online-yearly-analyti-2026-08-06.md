# Transaction IDs, WhatsApp receipts, cash/online, yearly analytics

## What changes

**1. Transaction ID on every donation**
- Each saved donation gets a unique auto ID like `SSMM-2026-000123` (mandal prefix, calendar year, zero-padded receipt number).
- Shown on the receipt (thermal, browser print, PDF), in the records table, and in the WhatsApp message.

**2. Send receipt to donor's phone**
- A "Send on WhatsApp" button appears after saving a donation, enabled when a donor phone is entered.
- It opens WhatsApp with a pre-filled receipt summary: mandal name, transaction ID, receipt no., donor name, amount, lane, payment mode, date, and the footer/thank-you line.
- Also available per row in Records, so an old receipt can be resent.

**3. Cash / Online toggle in Collect**
- Two-option switch at the top of the donation form: Online (UPI) or Cash.
- Cash hides the UPI QR entirely and saves the donation as paid in cash.
- Online keeps the current locked-amount QR flow.
- Payment mode prints on the receipt and shows as a column + filter in Records.

**4. Analytics additions**
- Daily collection chart: bar/line of amount collected per day, with a date-range control (this festival period / last 30 days / all).
- Yearly totals: one card row or small table showing total collected and receipt count for each calendar year, plus the current year highlighted.
- Existing 12-lane bar graph stays as-is.

## Technical notes

- Migration on `donations`: add `payment_mode text not null default 'online'` (values `online` | `cash`) and `txn_id text` (unique), backfilling existing rows from `receipt_no` and `created_at`. Keep existing RLS policies and grants; add grants only if a new table were created (none is).
- `txn_id` generated in a database trigger from the receipt sequence so it can never collide, format `SSMM-<YYYY>-<6-digit receipt_no>`.
- `src/lib/receipt.ts`: add txn ID and payment mode lines to `buildReceiptLines`; add a `buildWhatsappText(donation, settings)` helper and a `wa.me` link builder that strips non-digits and prefixes country code 91 when the number is 10 digits.
- Collect page: payment-mode state gates the `UpiQr` render and sets `payment_mode` + `status` on insert (cash saves as paid).
- Records page: new Mode column, mode filter alongside the lane filter, WhatsApp action button per row (disabled without a phone number).
- Analytics page: derive daily buckets and per-year aggregates from the existing `donations` query — no extra fetch. Daily chart uses the same Recharts setup and theme tokens.
- Ledger PDF gains Txn ID and Mode columns.

## Not included

- No automated SMS (no Twilio); WhatsApp is a tap-to-send link opened by the collector.
