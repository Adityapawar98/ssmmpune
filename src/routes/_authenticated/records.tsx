import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, MessageCircle, Pencil, Printer, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useIsAdmin, useReceiptSettings, useSessionUser } from "@/hooks/useAuthUser";
import { supabase } from "@/integrations/supabase/client";
import { audit } from "@/lib/audit";
import { formatDateTime, formatINR, LANES } from "@/lib/lanes";
import { browserPrintReceipt, downloadLedgerPdf, downloadReceiptPdf } from "@/lib/pdf";
import { waPhone, type Donation, type ReceiptSettings } from "@/lib/receipt";
import { sendWhatsappReceipt } from "@/lib/send-whatsapp";

function toLocalInputValue(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export const Route = createFileRoute("/_authenticated/records")({
  head: () => ({
    meta: [
      { title: "Donation Records | Ganesh Utsav Tracker" },
      { name: "description", content: "Search every donation receipt and export the full ledger as a PDF." },
      { property: "og:title", content: "Donation Records" },
      { property: "og:description", content: "Search, reprint and export donation receipts." },
    ],
  }),
  component: RecordsPage,
});

function RecordsPage() {
  const queryClient = useQueryClient();
  const { data: settings } = useReceiptSettings();
  const { user } = useSessionUser();
  const { data: isAdmin } = useIsAdmin(user?.id);
  const [search, setSearch] = useState("");
  const [lane, setLane] = useState("all");
  const [mode, setMode] = useState("all");
  const [selected, setSelected] = useState<string[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [editing, setEditing] = useState<Donation | null>(null);

  const { data: donations = [], isLoading } = useQuery({
    queryKey: ["donations"],
    queryFn: async () => {
      const { data, error } = await supabase.from("donations").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data as Donation[];
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return donations.filter(
      (d) =>
        (lane === "all" || d.lane === lane) &&
        (mode === "all" || d.payment_mode === mode) &&
        (!q ||
          d.donor_name.toLowerCase().includes(q) ||
          String(d.receipt_no).includes(q) ||
          (d.txn_id ?? "").toLowerCase().includes(q) ||
          (d.donor_phone ?? "").includes(q)),
    );
  }, [donations, search, lane, mode]);

  const visibleIds = useMemo(() => new Set(filtered.map((d) => d.id)), [filtered]);
  const selectedVisible = selected.filter((id) => visibleIds.has(id));
  const selectedTotal = filtered
    .filter((d) => selectedVisible.includes(d.id))
    .reduce((s, d) => s + Number(d.amount), 0);
  const allSelected = filtered.length > 0 && selectedVisible.length === filtered.length;

  const total = filtered.reduce((s, d) => s + Number(d.amount), 0);

  // Re-render at local midnight so "Today's collection" resets even if the page stays open.
  const [dayKey, setDayKey] = useState(() => new Date().toDateString());
  useEffect(() => {
    const now = new Date();
    const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 2);
    const timer = window.setTimeout(() => setDayKey(new Date().toDateString()), nextMidnight.getTime() - now.getTime());
    return () => window.clearTimeout(timer);
  }, [dayKey]);

  const today = useMemo(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0);
    return donations.filter((d) => {
      const t = new Date(d.created_at);
      return t >= start && t < end;
    });
    // dayKey forces recomputation when the calendar day rolls over at midnight
  }, [donations, dayKey]);

  const todayOnline = today.filter((d) => d.payment_mode === "online");
  const todayCash = today.filter((d) => d.payment_mode === "cash");
  const todayOnlineTotal = todayOnline.reduce((s, d) => s + Number(d.amount), 0);
  const todayCashTotal = todayCash.reduce((s, d) => s + Number(d.amount), 0);
  const todayTotal = todayOnlineTotal + todayCashTotal;


  const deleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const removed = donations.filter((d) => ids.includes(d.id));
      const { error } = await supabase.from("donations").delete().in("id", ids);
      if (error) throw error;
      return removed;
    },
    onSuccess: (removed) => {
      const count = removed.length;
      setSelected([]);
      setConfirmOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["donations"] });
      audit({
        action: "Donations deleted",
        category: "security",
        entity: "donations",
        summary: `Deleted ${count} receipt${count === 1 ? "" : "s"} (${removed
          .map((d) => d.txn_id ?? `#${d.receipt_no}`)
          .join(", ")}) totalling ${formatINR(removed.reduce((s, d) => s + Number(d.amount), 0))}`,
        details: { receipts: removed.map((d) => ({ receipt_no: d.receipt_no, txn_id: d.txn_id, amount: d.amount })) },
      });
      toast.success(`${count} receipt${count === 1 ? "" : "s"} deleted`);
    },
    onError: (e: Error) => toast.error(e.message || "Could not delete the selected receipts"),
  });


  function toggleOne(id: string, checked: boolean) {
    setSelected((prev) => (checked ? [...new Set([...prev, id])] : prev.filter((x) => x !== id)));
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl">Donation records</h1>
          <p className="text-sm text-muted-foreground">
            {filtered.length} receipts · {formatINR(total)}
          </p>
        </div>
        {isAdmin ? (
          <Button
            disabled={!settings || !filtered.length}
            onClick={() => {
              if (!settings) return;
              const rangeLabel = `${lane === "all" ? "All lanes" : lane} · ${mode === "all" ? "All modes" : mode === "cash" ? "Cash" : "Online"}`;
              downloadLedgerPdf(filtered, settings, { rangeLabel });
              audit({
                action: "Ledger exported",
                category: "ledger",
                entity: "donations",
                summary: `Exported ledger PDF — ${filtered.length} receipts, ${formatINR(total)} (${rangeLabel})`,
                details: { count: filtered.length, total, rangeLabel },
              });
            }}
          >
            <Download className="size-4" /> Export ledger PDF
          </Button>
        ) : null}


      </div>

      <div className="flex flex-wrap gap-3">
        <Input
          placeholder="Search donor, phone, receipt or txn ID"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-11 max-w-xs"
        />
        <Select value={lane} onValueChange={setLane}>
          <SelectTrigger className="!h-11 w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All lanes</SelectItem>
            {LANES.map((l) => (
              <SelectItem key={l} value={l}>
                {l}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={mode} onValueChange={setMode}>
          <SelectTrigger className="!h-11 w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All modes</SelectItem>
            <SelectItem value="online">Online (UPI)</SelectItem>
            <SelectItem value="cash">Cash</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card className="border-primary/20 bg-primary/5">
        <CardHeader>
          <CardTitle className="font-display text-xl">Today's collection</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-lg border border-border bg-card p-4">
              <p className="text-sm text-muted-foreground">Online (UPI)</p>
              <p className="mt-1 font-display text-2xl">{formatINR(todayOnlineTotal)}</p>
              <p className="text-xs text-muted-foreground">{todayOnline.length} receipt{todayOnline.length === 1 ? "" : "s"}</p>
            </div>
            <div className="rounded-lg border border-border bg-card p-4">
              <p className="text-sm text-muted-foreground">Cash</p>
              <p className="mt-1 font-display text-2xl">{formatINR(todayCashTotal)}</p>
              <p className="text-xs text-muted-foreground">{todayCash.length} receipt{todayCash.length === 1 ? "" : "s"}</p>
            </div>
            <div className="rounded-lg border border-border bg-card p-4">
              <p className="text-sm text-muted-foreground">Total today</p>
              <p className="mt-1 font-display text-2xl text-primary">{formatINR(todayTotal)}</p>
              <p className="text-xs text-muted-foreground">{today.length} receipt{today.length === 1 ? "" : "s"}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {isAdmin && selectedVisible.length > 0 ? (
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-secondary/50 px-4 py-3">
          <p className="mr-auto text-sm font-medium">
            {selectedVisible.length} selected · {formatINR(selectedTotal)}
          </p>
          <Button variant="ghost" size="sm" onClick={() => setSelected([])}>
            Clear
          </Button>
          <Button variant="destructive" size="sm" onClick={() => setConfirmOpen(true)}>
            <Trash2 className="size-4" /> Delete selected
          </Button>
        </div>
      ) : null}


      <Card>
        <CardHeader>
          <CardTitle className="font-display text-xl">Ledger</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
          ) : !filtered.length ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No donations recorded yet.</p>
          ) : (
            <>
              {/* Phone layout: stacked cards instead of a sideways-scrolling table */}
              <ul className="space-y-3 md:hidden">
                {filtered.map((d) => (
                  <li key={d.id} className="rounded-lg border border-border p-3">
                    <div className="flex items-start gap-3">
                      {isAdmin ? (
                        <Checkbox
                          className="mt-1 shrink-0"
                          checked={selected.includes(d.id)}
                          aria-label={`Select receipt ${d.receipt_no}`}
                          onCheckedChange={(c) => toggleOne(d.id, !!c)}
                        />
                      ) : null}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <p className="truncate font-medium">{d.donor_name}</p>
                          <p className="shrink-0 font-medium">{formatINR(Number(d.amount))}</p>
                        </div>
                        <p className="font-mono text-xs text-muted-foreground">{d.txn_id ?? `#${d.receipt_no}`}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {d.lane} · {d.payment_mode === "cash" ? "Cash" : "Online"} ·{" "}
                          {d.status === "paid" ? "Paid" : "Pending"}
                        </p>
                        <p className="text-xs text-muted-foreground">{formatDateTime(d.created_at)}</p>
                        <div className="mt-2 flex flex-wrap gap-1">
                          <RowActions donation={d} settings={settings} onEdit={() => setEditing(d)} />
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>

              <div className="hidden overflow-x-auto md:block">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-muted-foreground">
                      {isAdmin ? (
                        <th className="py-2 pr-3">
                          <Checkbox
                            checked={allSelected}
                            aria-label="Select all receipts"
                            onCheckedChange={(c) => setSelected(c ? filtered.map((d) => d.id) : [])}
                          />
                        </th>
                      ) : null}
                      <th className="py-2 pr-3 font-medium">#</th>
                      <th className="py-2 pr-3 font-medium">Txn ID</th>
                      <th className="py-2 pr-3 font-medium">Date</th>
                      <th className="py-2 pr-3 font-medium">Donor</th>
                      <th className="py-2 pr-3 font-medium">Lane</th>
                      <th className="py-2 pr-3 font-medium">Mode</th>
                      <th className="py-2 pr-3 font-medium">Status</th>
                      <th className="py-2 pr-3 text-right font-medium">Amount</th>
                      <th className="py-2 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((d) => (
                      <tr key={d.id} className="border-b border-border/60">
                        {isAdmin ? (
                          <td className="py-2 pr-3">
                            <Checkbox
                              checked={selected.includes(d.id)}
                              aria-label={`Select receipt ${d.receipt_no}`}
                              onCheckedChange={(c) => toggleOne(d.id, !!c)}
                            />
                          </td>
                        ) : null}
                        <td className="py-2 pr-3">{d.receipt_no}</td>
                        <td className="py-2 pr-3 font-mono text-xs whitespace-nowrap">{d.txn_id ?? "—"}</td>
                        <td className="py-2 pr-3 whitespace-nowrap">{formatDateTime(d.created_at)}</td>
                        <td className="py-2 pr-3">{d.donor_name}</td>
                        <td className="py-2 pr-3">{d.lane}</td>
                        <td className="py-2 pr-3">{d.payment_mode === "cash" ? "Cash" : "Online"}</td>
                        <td className="py-2 pr-3">{d.status === "paid" ? "Paid" : "Pending"}</td>
                        <td className="py-2 pr-3 text-right font-medium">{formatINR(Number(d.amount))}</td>
                        <td className="flex gap-1 py-2">
                          <RowActions donation={d} settings={settings} onEdit={() => setEditing(d)} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </CardContent>

      </Card>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {selectedVisible.length} receipt{selectedVisible.length === 1 ? "" : "s"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the selected donations from the ledger. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteMutation.isPending}
              onClick={(e) => {
                e.preventDefault();
                deleteMutation.mutate(selectedVisible);
              }}
            >
              {deleteMutation.isPending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>

      </AlertDialog>

      <EditDonationDialog donation={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

function RowActions({
  donation: d,
  settings,
  onEdit,
}: {
  donation: Donation;
  settings: ReceiptSettings | null | undefined;
  onEdit: () => void;
}) {
  const canWa = !!settings && !!waPhone(d.donor_phone);
  const label = d.txn_id ?? `#${d.receipt_no}`;

  return (
    <>
      <Button size="sm" variant="ghost" title="Edit record" onClick={onEdit}>
        <Pencil className="size-4" />
      </Button>
      <Button
        size="sm"
        variant="ghost"
        disabled={!settings}
        title="Reprint receipt"
        onClick={() => {
          if (!settings) return;
          browserPrintReceipt(d, settings);
          audit({
            action: "Receipt reprinted",
            category: "receipt",
            entity: "donations",
            entityId: d.id,
            summary: `Reprinted receipt ${label} for ${d.donor_name}`,
          });
        }}
      >
        <Printer className="size-4" />
      </Button>
      <Button
        size="sm"
        variant="ghost"
        disabled={!settings}
        title="Download receipt PDF"
        onClick={() => {
          if (!settings) return;
          downloadReceiptPdf(d, settings);
          audit({
            action: "Receipt downloaded",
            category: "receipt",
            entity: "donations",
            entityId: d.id,
            summary: `Downloaded PDF of receipt ${label}`,
          });
        }}
      >
        <Download className="size-4" />
      </Button>
      <Button
        size="sm"
        variant="ghost"
        disabled={!canWa}
        title={canWa ? "Send receipt on WhatsApp" : "No donor phone number"}
        onClick={() => {
          if (!settings) return;
          sendWhatsappReceipt(d, settings);
          audit({
            action: "Receipt sent on WhatsApp",
            category: "receipt",
            entity: "donations",
            entityId: d.id,
            summary: `Sent receipt ${label} to ${d.donor_name}`,
          });
        }}
      >
        <MessageCircle className="size-4" />
      </Button>
    </>
  );
}

function EditDonationDialog({ donation, onClose }: { donation: Donation | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    donor_name: "",
    donor_phone: "",
    amount: "",
    created_at: "",
    lane: "",
    payment_mode: "online",
    status: "pending",
    upi_ref: "",
    note: "",
  });

  useEffect(() => {
    if (!donation) return;
    setForm({
      donor_name: donation.donor_name,
      donor_phone: donation.donor_phone ?? "",
      amount: String(donation.amount),
      created_at: toLocalInputValue(donation.created_at),
      lane: donation.lane,
      payment_mode: donation.payment_mode,
      status: donation.status,
      upi_ref: donation.upi_ref ?? "",
      note: donation.note ?? "",
    });
  }, [donation]);

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!donation) throw new Error("No record selected");
      const amount = Number(form.amount);
      if (!form.donor_name.trim()) throw new Error("Donor name is required");
      if (!Number.isFinite(amount) || amount <= 0) throw new Error("Enter a valid amount");
      const newPaidAt =
        form.status === "paid" ? (donation.status === "paid" && donation.paid_at ? donation.paid_at : new Date().toISOString()) : null;
      const patch = {
        donor_name: form.donor_name.trim(),
        donor_phone: form.donor_phone.trim() || null,
        amount,
        created_at: new Date(form.created_at).toISOString(),
        lane: form.lane,
        payment_mode: form.payment_mode,
        status: form.status,
        paid_at: newPaidAt,
        upi_ref: form.upi_ref.trim() || null,
        note: form.note.trim() || null,
      };
      const { error } = await supabase.from("donations").update(patch).eq("id", donation.id);
      if (error) throw error;
      return patch;
    },
    onSuccess: (patch) => {
      if (donation) {
        const changes: string[] = [];
        const track = (label: string, before: string, after: string) => {
          if (before !== after) changes.push(`${label}: ${before} → ${after}`);
        };
        track("name", donation.donor_name, patch.donor_name);
        track("phone", donation.donor_phone ?? "—", patch.donor_phone ?? "—");
        track("amount", formatINR(Number(donation.amount)), formatINR(patch.amount));
        track("date", formatDateTime(donation.created_at), formatDateTime(patch.created_at));
        track("lane", donation.lane, patch.lane);
        track("mode", donation.payment_mode, patch.payment_mode);
        track("status", donation.status, patch.status);
        track("UPI ref", donation.upi_ref ?? "—", patch.upi_ref ?? "—");
        track("note", donation.note ?? "—", patch.note ?? "—");
        audit({
          action: "Donation edited",
          category: "ledger",
          entity: "donations",
          entityId: donation.id,
          summary: `Edited receipt ${donation.txn_id ?? `#${donation.receipt_no}`}${changes.length ? ` — ${changes.join("; ")}` : " (no changes)"}`,
          details: { before: donation, after: patch },
        });
      }
      void queryClient.invalidateQueries({ queryKey: ["donations"] });
      toast.success("Record updated");
      onClose();
    },
    onError: (e: Error) => toast.error(e.message || "Could not update the record"),
  });

  return (
    <Dialog open={!!donation} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display">
            Edit receipt {donation?.txn_id ?? (donation ? `#${donation.receipt_no}` : "")}
          </DialogTitle>
          <DialogDescription>
            Change any detail of this record. The receipt number and transaction ID stay the same.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="edit-name">Donor name</Label>
            <Input
              id="edit-name"
              value={form.donor_name}
              onChange={(e) => setForm((f) => ({ ...f, donor_name: e.target.value }))}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="edit-phone">Phone</Label>
            <Input
              id="edit-phone"
              value={form.donor_phone}
              onChange={(e) => setForm((f) => ({ ...f, donor_phone: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="edit-amount">Amount (₹)</Label>
              <Input
                id="edit-amount"
                type="number"
                min="1"
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-date">Date &amp; time</Label>
              <Input
                id="edit-date"
                type="datetime-local"
                value={form.created_at}
                onChange={(e) => setForm((f) => ({ ...f, created_at: e.target.value }))}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label>Lane</Label>
              <Select value={form.lane} onValueChange={(v) => setForm((f) => ({ ...f, lane: v }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LANES.map((l) => (
                    <SelectItem key={l} value={l}>
                      {l}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Payment mode</Label>
              <Select value={form.payment_mode} onValueChange={(v) => setForm((f) => ({ ...f, payment_mode: v }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="online">Online (UPI)</SelectItem>
                  <SelectItem value="cash">Cash</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="paid">Paid</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-upi">UPI reference</Label>
              <Input
                id="edit-upi"
                value={form.upi_ref}
                onChange={(e) => setForm((f) => ({ ...f, upi_ref: e.target.value }))}
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="edit-note">Note</Label>
            <Textarea
              id="edit-note"
              rows={2}
              value={form.note}
              onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={updateMutation.isPending} onClick={() => updateMutation.mutate()}>
            {updateMutation.isPending ? "Saving…" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
