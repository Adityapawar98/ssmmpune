# Admin-approved logins + shared live ledger

Two changes: new accounts stay locked out until an admin approves them, and every approved person sees the same donation records, updating live.

## 1. Approval gate

- Each account gets an approval state: **pending**, **approved**, or **rejected**, plus who approved it and when.
- New sign-ups (email/password or Google) start as **pending**.
- Existing accounts: current admins are auto-approved; every existing collector becomes **pending** and must be approved from the new screen.
- A pending or rejected person can sign in but sees only a "Waiting for admin approval" screen with a sign-out button — no collect, records, analytics, settings or audit access, and the database itself refuses their reads and writes (not just hidden buttons).

## 2. Login requests screen (admin only)

New tab **Login requests** next to Audit log, at `/requests`:
- Pending list first, with name, email and sign-up date, and **Approve** / **Reject** buttons.
- Below it, the full list of approved and rejected people, with the ability to revoke access (back to rejected) or re-approve.
- A count badge on the tab when requests are waiting.
- Every approve/reject/revoke is written to the audit log with the admin's name and timestamp.

## 3. Shared, live records

- Every approved user (collector or admin) sees **all** donations in Records, Collect history and the dashboard totals — not just their own.
- Anyone approved can edit a record (mark paid, add UPI reference, fix details); **deleting stays admin-only**, single or bulk.
- Live updates: when someone adds or edits a donation on another device, the records list and dashboard refresh automatically within a second, no manual reload.
- Edits are recorded in the audit log showing who changed what.

## Technical notes

- Migration: add `approval_status` (enum, default `pending`), `approved_at`, `approved_by` to `profiles`; backfill `approved` for anyone holding the `admin` role, `pending` for the rest. Update `handle_new_user` so the first account (which becomes admin) is created approved.
- New security-definer function `public.is_approved(_user_id uuid)` used by policies, avoiding recursive profile lookups.
- Policy rewrite on `donations`: SELECT and UPDATE become `is_approved(auth.uid())` instead of `collected_by = auth.uid()`; INSERT requires approved + own `collected_by`; DELETE stays `has_role(admin)`. `receipt_settings` read and `audit_log` insert also require approval.
- Admins manage approval through an admin-only UPDATE policy on `profiles` restricted to the approval columns; profiles SELECT widened so approved users can see collector names on shared records (name only, no emails for non-admins — a view or column-limited select).
- Realtime: `ALTER PUBLICATION supabase_realtime ADD TABLE public.donations`, with a `useEffect` channel subscription in Records and Dashboard invalidating the React Query keys on change, torn down on unmount.
- `_authenticated/route.tsx` gains an approval check that renders the pending screen instead of `<Outlet />`; new route `src/routes/_authenticated/requests.tsx` guarded by `isAdmin`.
