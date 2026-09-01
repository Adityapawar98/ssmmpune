# Edit any donation record from Records

Add an **Edit** action on every receipt in the Records ledger so any approved user or admin can change any field: donor name, phone, amount, date/time, lane, payment mode (cash/online), status (pending/paid), UPI reference and note.

## What changes

1. **Edit button in the ledger**
   - New pencil icon in the row actions on both the phone card layout and the desktop table, next to Print / PDF / WhatsApp.
   - Opens a dialog pre-filled with the current values of that record.

2. **Edit dialog**
   - Fields: donor name, phone, amount (₹), date & time (datetime picker), lane (dropdown of the 12 lanes), payment mode (Cash / Online toggle), status (Paid / Pending), UPI reference, note.
   - Amount must be a positive number; name is required.
   - **Save changes** updates the record; **Cancel** closes without changes.
   - Receipt number and transaction ID stay fixed (they are the printed proof of the original receipt) — everything else is editable.

3. **Permissions**
   - Any approved user can edit (matching the existing shared-ledger rule); delete stays admin-only. No database change needed — the current policy already allows approved users to update donations.

4. **Live sync + audit**
   - The existing realtime subscription refreshes every signed-in device automatically after an edit.
   - Each edit is written to the audit log with the actor's name and a summary of what changed (old → new values).

## Technical notes

- `src/routes/_authenticated/records.tsx`: add an `EditDonationDialog` component (Dialog + form state), wire the pencil `Button` into `RowActions`, and an update `useMutation` calling `supabase.from("donations").update({...}).eq("id", d.id)`, then invalidate the `donations` query key and call `audit()` with the changed fields.
- `paid_at` is set to now when status changes to paid, cleared when changed back to pending.
- No migration required.
