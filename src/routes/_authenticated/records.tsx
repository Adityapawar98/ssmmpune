import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Download, Printer } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useReceiptSettings } from "@/hooks/useAuthUser";
import { supabase } from "@/integrations/supabase/client";
import { formatDateTime, formatINR, LANES } from "@/lib/lanes";
import { browserPrintReceipt, downloadLedgerPdf, downloadReceiptPdf } from "@/lib/pdf";
import type { Donation } from "@/lib/receipt";

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
  const { data: settings } = useReceiptSettings();
  const [search, setSearch] = useState("");
  const [lane, setLane] = useState("all");
  const [mode, setMode] = useState("all");

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

  const total = filtered.reduce((s, d) => s + Number(d.amount), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl">Donation records</h1>
          <p className="text-sm text-muted-foreground">
            {filtered.length} receipts · {formatINR(total)}
          </p>
        </div>
        <Button
          disabled={!settings || !filtered.length}
          onClick={() =>
            settings &&
            downloadLedgerPdf(filtered, settings, {
              rangeLabel: `${lane === "all" ? "All lanes" : lane} · ${mode === "all" ? "All modes" : mode === "cash" ? "Cash" : "Online"}`,
            })
          }
        >
          <Download className="size-4" /> Export ledger PDF
        </Button>
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


      <Card>
        <CardHeader>
          <CardTitle className="font-display text-xl">Ledger</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {isLoading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
          ) : !filtered.length ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No donations recorded yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
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
                {filtered.map((d) => {
                  const wa = settings ? buildWhatsappLink(d, settings) : null;
                  return (
                    <tr key={d.id} className="border-b border-border/60">
                      <td className="py-2 pr-3">{d.receipt_no}</td>
                      <td className="py-2 pr-3 font-mono text-xs whitespace-nowrap">{d.txn_id ?? "—"}</td>
                      <td className="py-2 pr-3 whitespace-nowrap">{formatDateTime(d.created_at)}</td>
                      <td className="py-2 pr-3">{d.donor_name}</td>
                      <td className="py-2 pr-3">{d.lane}</td>
                      <td className="py-2 pr-3">{d.payment_mode === "cash" ? "Cash" : "Online"}</td>
                      <td className="py-2 pr-3">{d.status === "paid" ? "Paid" : "Pending"}</td>
                      <td className="py-2 pr-3 text-right font-medium">{formatINR(Number(d.amount))}</td>
                      <td className="flex gap-1 py-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={!settings}
                          onClick={() => settings && browserPrintReceipt(d, settings)}
                        >
                          <Printer className="size-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={!settings}
                          onClick={() => settings && downloadReceiptPdf(d, settings)}
                        >
                          <Download className="size-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={!wa}
                          title={wa ? "Send receipt on WhatsApp" : "No donor phone number"}
                          onClick={() => wa && window.open(wa, "_blank", "noopener")}
                        >
                          <MessageCircle className="size-4" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
