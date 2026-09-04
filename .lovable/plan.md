# Admin Expense Tracking

## Outcome

Add an admin-only Expenses section where an admin can record an expense with an amount and reason. Admin analytics will show the expense total and the net amount remaining after expenses; approved collectors will continue to see donation totals only and will not see expense records.

## User experience

1. Add an **Expenses** item beside the existing admin-only navigation items.
2. The Expenses page will be blocked for non-admins and will contain:
   - amount input in rupees
   - reason input
   - save action
   - list of recorded expenses with date, reason, and amount
   - total expenses
   - delete action for admins, with confirmation
3. Add expense-aware totals to Analytics for admins:
   - Total collected (donations)
   - Total expenses
   - Net total = total collected minus total expenses
   - Existing lane chart remains donation-only because expenses are not assigned to a lane.
4. Keep collector analytics and records unchanged from their current donation-only view.
5. Record expense creation and deletion in the existing admin audit log with actor name, timestamp, amount, and reason.

## Data and access

Create a new `public.expenses` table with an id, amount, reason, created_at, and created_by. Grant access only to `authenticated` as needed for RLS and `service_role`, enable RLS, and add policies that allow only users with the admin role to select, insert, and delete expenses. No anonymous access will be added.

The generated database types will be updated for the new table, and the UI will use the existing authenticated client and role checks. Expense data will never be loaded for collectors.

## Technical details

- Add a dedicated authenticated route for the Expenses page and register it in the generated route flow by creating the route file; do not edit generated route-tree output.
- Use existing design-system controls, query invalidation, toast feedback, confirmation dialog, and audit helper.
- Subscribe to expense changes or invalidate the relevant queries after mutations so admin analytics refresh immediately.
- Update route metadata for the new page and preserve existing donation calculations and receipt behavior.
- Apply the schema change through a migration with explicit grants before RLS policies.

## Verification

- Confirm an admin can add an expense and see the expense list, expense total, and reduced net total.
- Confirm an admin can delete an expense and totals recalculate.
- Confirm a collector cannot access the Expenses page or expense data and still sees donation-only analytics.
- Confirm audit entries are created for expense additions and deletions.
- Check the build and current preview for runtime errors.