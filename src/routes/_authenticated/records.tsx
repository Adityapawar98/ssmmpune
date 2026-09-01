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
