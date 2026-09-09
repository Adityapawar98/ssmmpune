# Lane-wise ledger PDF export

## What will change
- Update the ledger PDF export so donation rows are grouped into clearly labeled lane sections in the existing lane order: Lane no. 1 through Lane no. 11, Main Rd, then Shops.
- Give each lane section its own table with the receipt details and a visible lane subtotal, followed by a final grand total.
- Keep the current Records filters, admin-only export access, receipt data, and audit entry behavior unchanged.
- Keep the PDF readable across page breaks, including repeated table headers and avoiding empty lane sections unless a lane has matching records.

## Technical details
- Reuse the shared `LANES` definition so the PDF stays synchronized with the Collect and Records lane choices.
- Update the PDF layout and filename logic only where needed; no database changes are required.
- Verify the generated PDF visually for lane headings, row grouping, subtotals, Shops, and the final total, then check the app build and export action.