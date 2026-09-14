# Add "Politician" lane option

Add a new lane option called **Politician** to the donation collection dropdown, so donations can be tagged and reported separately.

## Changes

1. **Update `src/lib/lanes.ts`**
   - Append `"Politician"` to the `LANES` array after `"Shops"`.
   - Add `"Politician": "Politician"` to the `SHORT_LANE` record.

## Impact

Because the app reads lanes from the shared `LANES` constant, the new option will appear automatically in:
- Collect page lane dropdown
- Records filters and edit form
- Analytics bar chart
- Lane-wise ledger PDF export

No database schema changes are needed because the `lane` column stores free-text values.
