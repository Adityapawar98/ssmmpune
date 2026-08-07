# Ledger bulk delete (admin) + WhatsApp send fix

## 1. Multi-select delete in Records (admins only)

- A checkbox column appears in the ledger table only when the signed-in user is an admin, plus a "select all" checkbox in the header that covers the currently filtered rows.
- When one or more rows are selected, a bar appears above the table: "N selected · Total amount" with a "Delete selected" button and a "Clear" button.
- Delete asks for confirmation in a dialog naming how many receipts will be permanently removed, then deletes them and refreshes the ledger with a success toast.
- Non-admins see the table exactly as today — no checkboxes, no delete bar.

## 2. WhatsApp receipt sending error

The current button opens `wa.me/...` in a new tab. That URL redirects to `api.whatsapp.com`, which refuses to render when the tab is opened from inside the app preview — the result is the "api.whatsapp.com is blocked / ERR_BLOCKED_BY_RESPONSE" page in the screenshot.

Changes:
- Open WhatsApp through a real link element (`<a target="_blank" rel="noopener noreferrer">` click) instead of a scripted `window.open`, so the browser treats it as a normal user navigation rather than a script-opened popup from an embedded frame.
- Send to `https://api.whatsapp.com/send?phone=...&text=...` on desktop and `https://wa.me/...` on mobile, picking the form each platform handles without the intermediate redirect.
- Add a fallback: if the tab cannot be opened (popup blocked), show a toast with a "Copy receipt text" action so the collector can paste it into WhatsApp manually.
- Same behaviour used in both Collect and Records, from one shared helper.

## Technical notes

- `src/lib/receipt.ts`: replace `buildWhatsappLink` with a platform-aware builder and add `openWhatsapp(donation, settings)` that creates a temporary anchor, clicks it, and returns false if blocked.
- `src/routes/_authenticated/records.tsx`: `useIsAdmin(user?.id)` gates the selection column; selection held as a `Set<string>` of donation ids, cleared when filters change; delete via `supabase.from("donations").delete().in("id", ids)` then `queryClient.invalidateQueries(["donations"])`. Existing RLS already restricts deletes to admins, so a non-admin bypass attempt still fails server-side.
- Confirmation uses the existing shadcn `AlertDialog`; toasts use sonner.
- No database changes needed.
