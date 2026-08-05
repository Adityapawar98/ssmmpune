# Ganesh Utsav Donation Tracker

A login-protected donation collection app for the mandal: admin enters an amount, a UPI QR for exactly that amount appears, the receipt prints on a thermal printer, every record is stored, and a bar graph shows collections across Lane no. 1–11 plus Main Rd.

## Backend

Lovable Cloud will be enabled to provide the database, logins, and server logic.

Data stored:
- **donations** — donor name, phone (optional), amount, lane (Lane no. 1 … Lane no. 11, Main Rd), payment status (pending/paid), UPI reference, receipt number, collected-by, timestamp
- **profiles** — name for each account
- **user_roles** — separate roles table (`admin` / `user`) so roles can't be tampered with
- **receipt_settings** — single row holding the customizable receipt template (mandal name, address, header line, footer/blessing line, logo, UPI ID, paper width 58mm/80mm, which fields to show)

Access rules: only signed-in users can read/write donations; only admins can edit receipt settings, delete donations, or see the full ledger export. Regular users can record donations and print their own receipts.

## Pages

**/ — Login page**
Email + password sign-in for both admins and volunteers. After login, admins land on the dashboard, volunteers on the collection screen. Sign-out is available everywhere.

**/collect — New donation**
Form: donor name, phone, lane dropdown (12 options), amount. On submit:
- A UPI QR is generated with the amount locked in, so the donor's app opens pre-filled with that exact figure and cannot be edited.
- Donor scans and pays; the collector taps "Mark as paid" and optionally enters the UPI reference. (UPI has no free auto-confirmation API — confirmation is a manual tap. Auto-verification would require a paid payment gateway; I can add that later if you want.)
- A receipt number is assigned and the record is saved.

**Receipt + printing**
After a donation is saved, a receipt preview renders in the configured paper width. Two print paths:
- **Connect printer** — pairs a thermal printer over Bluetooth or USB directly from the browser and sends ESC/POS commands, so it prints instantly with no dialog. (Works in Chrome on desktop and Android; iPhone/Safari doesn't allow this.)
- **Fallback** — a standard browser print for the same receipt layout, so nothing breaks if the direct connection isn't available.
- **Download PDF** — saves that single receipt as a PDF.

**/settings — Receipt customization (admin)**
Live editor for the receipt: mandal name, address, contact, UPI ID, header and footer text, logo, paper width, and toggles for which fields print. Preview updates as you type.

**/dashboard — Admin dashboard**
- Total collected, count of donations, today's total, pending vs paid
- **One bar graph with 12 bars** — Lane no. 1 through Lane no. 11 and Main Rd — showing total collected per lane, with amounts labelled on each bar
- Date-range filter that updates the graph and totals

**/records — Ledger**
Searchable, filterable table of every donation (by lane, date, status, donor). Actions: reprint receipt, download single receipt PDF, and **Export ledger PDF** — a formatted report with all records, per-lane subtotals, and a grand total.

## Look and feel

Festive but clean: deep saffron and marigold accents on warm cream, with a subtle traditional motif in the header, large touch-friendly inputs for on-ground use on phones, and a mobile-first layout throughout.

## Technical notes

- UPI QR built from a `upi://pay?pa=…&pn=…&am=<amount>&cu=INR&tn=…` string rendered client-side with `qrcode`; the amount is fixed in the URI so the payer app shows it non-editable.
- Thermal printing via Web Bluetooth / WebUSB writing raw ESC/POS bytes; the template is compiled into ESC/POS text with alignment, size, and cut commands. Browser-print CSS `@page` fallback at 58mm/80mm.
- PDFs generated client-side with `jspdf` + `jspdf-autotable`.
- Bar chart via `recharts`, one `BarChart` with 12 categories.
- Auth: email/password, roles in a separate `user_roles` table checked through a security-definer function; protected routes live under an authenticated layout.

## What I need from you

The mandal's **UPI ID** (e.g. `adityapawar8552@okaxis`) and display name to seed the receipt settings — you can also enter them on the settings page after login. Tell me the first admin's email and I'll note it, but you'll create the account yourself on the login screen.
