import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Download, Printer, RotateCcw } from "lucide-react";
import { toast } from "sonner";

import { PrinterBar, useThermalPrinter } from "@/components/PrinterBar";
import { UpiQr } from "@/components/UpiQr";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useProfile, useReceiptSettings, useSessionUser } from "@/hooks/useAuthUser";
import { supabase } from "@/integrations/supabase/client";
import { LANES } from "@/lib/lanes";
import { browserPrintReceipt, downloadReceiptPdf } from "@/lib/pdf";
import { buildReceiptLines, buildUpiUri, type Donation } from "@/lib/receipt";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Collect Donation | Ganesh Utsav Tracker" },
      { name: "description", content: "Enter a donation amount, show a locked UPI QR code and print the receipt." },
      { property: "og:title", content: "Collect Donation" },
      { property: "og:description", content: "Fixed-amount UPI QR plus instant thermal receipt printing." },
    ],
  }),
  component: DashboardPage,
});

const QUICK = [51, 101, 251, 501, 1001, 2100, 5100];

function DashboardPage() {
  const queryClient = useQueryClient();
  const { user } = useSessionUser();
  const { data: profile } = useProfile(user?.id);
  const { data: settings } = useReceiptSettings();
  const { connection, print } = useThermalPrinter();

  const [donorName, setDonorName] = useState("");
  const [donorPhone, setDonorPhone] = useState("");
  const [lane, setLane] = useState<string>(LANES[0]);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [mode, setMode] = useState<"online" | "cash">("online");
  const [saved, setSaved] = useState<Donation | null>(null);

  const numericAmount = Number(amount);
  const validAmount = Number.isFinite(numericAmount) && numericAmount > 0;

  const upiUri = useMemo(() => {
    if (!settings || !validAmount || mode === "cash") return "";
    return buildUpiUri({
      upiId: settings.upi_id,
      payeeName: settings.mandal_name,
      amount: numericAmount,
      note: note || `Ganesh Utsav ${lane}`,
    });
  }, [settings, validAmount, numericAmount, note, lane, mode]);

  const createDonation = useMutation({
    mutationFn: async (status: "paid" | "pending") => {
      const { data, error } = await supabase
        .from("donations")
        .insert({
          donor_name: donorName.trim(),
          donor_phone: donorPhone.trim() || null,
          lane,
          amount: numericAmount,
          note: note.trim() || null,
          status,
          payment_mode: mode,
          collected_by: user!.id,
          collected_by_name: profile?.full_name ?? user!.email ?? "",
        })
        .select()
        .single();
      if (error) throw error;
      return data as Donation;
    },
    onSuccess: (donation) => {
      setSaved(donation);
      queryClient.invalidateQueries({ queryKey: ["donations"] });
      toast.success(`Receipt #${donation.receipt_no} saved`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const receiptLines = saved && settings ? buildReceiptLines(saved, settings) : [];

  async function handleThermalPrint() {
    if (!receiptLines.length) return;
    try {
      await print(receiptLines);
      toast.success("Sent to thermal printer");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  function reset() {
    setDonorName("");
    setDonorPhone("");
    setAmount("");
    setNote("");
    setSaved(null);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl">Collect a donation</h1>
        <p className="text-sm text-muted-foreground">
          Enter the amount, let the donor scan, then print the receipt on the spot.
        </p>
      </div>

      <PrinterBar />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="font-display text-xl">Donation details</CardTitle>
            <CardDescription>The QR amount always matches what you enter here.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Payment mode</Label>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant={mode === "online" ? "default" : "outline"}
                  className="h-12"
                  onClick={() => setMode("online")}
                >
                  <Smartphone className="size-4" /> Online (UPI)
                </Button>
                <Button
                  type="button"
                  variant={mode === "cash" ? "default" : "outline"}
                  className="h-12"
                  onClick={() => setMode("cash")}
                >
                  <Banknote className="size-4" /> Cash
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="donor">Donor name</Label>
              <Input
                id="donor"
                value={donorName}
                onChange={(e) => setDonorName(e.target.value)}
                className="h-12"
                placeholder="e.g. Ramesh Patil"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="phone">Phone (optional)</Label>
                <Input
                  id="phone"
                  inputMode="tel"
                  value={donorPhone}
                  onChange={(e) => setDonorPhone(e.target.value)}
                  className="h-12"
                />
              </div>
              <div className="space-y-2">
                <Label>Lane</Label>
                <Select value={lane} onValueChange={setLane}>
                  <SelectTrigger className="!h-12 w-full">
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
            </div>
            <div className="space-y-2">
              <Label htmlFor="amount">Amount (Rs.)</Label>
              <Input
                id="amount"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="h-14 text-2xl font-semibold"
                placeholder="0"
              />
              <div className="flex flex-wrap gap-2 pt-1">
                {QUICK.map((q) => (
                  <Button key={q} type="button" variant="secondary" size="sm" onClick={() => setAmount(String(q))}>
                    ₹{q}
                  </Button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="note">Note (optional)</Label>
              <Textarea id="note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
            </div>
            <div className="flex flex-wrap gap-2 pt-2">
              <Button
                className="h-12 flex-1"
                disabled={!validAmount || !donorName.trim() || createDonation.isPending}
                onClick={() => createDonation.mutate("paid")}
              >
                <Check className="size-4" /> Save as paid
              </Button>
              <Button
                variant="outline"
                className="h-12"
                disabled={!validAmount || !donorName.trim() || createDonation.isPending}
                onClick={() => createDonation.mutate("pending")}
              >
                Save as pending
              </Button>
              <Button variant="ghost" className="h-12" onClick={reset}>
                <RotateCcw className="size-4" /> New
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          {validAmount && settings && upiUri ? (
            <UpiQr uri={upiUri} amount={numericAmount} upiId={settings.upi_id} />
          ) : (
            <Card className="border-dashed">
              <CardContent className="py-16 text-center text-sm text-muted-foreground">
                Enter an amount to generate the payment QR.
              </CardContent>
            </Card>
          )}

          {saved && settings ? (
            <Card>
              <CardHeader>
                <CardTitle className="font-display text-xl">Receipt #{saved.receipt_no}</CardTitle>
                <CardDescription>Preview of exactly what will print.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <pre className="overflow-x-auto rounded-md border border-border bg-muted p-3 font-mono text-[11px] leading-tight">
                  {receiptLines.join("\n")}
                </pre>
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => void handleThermalPrint()} disabled={!connection}>
                    <Printer className="size-4" /> Print on thermal
                  </Button>
                  <Button variant="outline" onClick={() => browserPrintReceipt(saved, settings)}>
                    <Printer className="size-4" /> Browser print
                  </Button>
                  <Button variant="outline" onClick={() => downloadReceiptPdf(saved, settings)}>
                    <Download className="size-4" /> Receipt PDF
                  </Button>
                </div>
                {!connection ? (
                  <p className="text-xs text-muted-foreground">
                    Connect a Bluetooth or USB thermal printer above to print directly.
                  </p>
                ) : null}
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
