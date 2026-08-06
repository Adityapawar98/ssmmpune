import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useReceiptSettings } from "@/hooks/useAuthUser";
import { supabase } from "@/integrations/supabase/client";
import type { ReceiptSettings } from "@/lib/receipt";
import { buildReceiptLines } from "@/lib/receipt";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Receipt Setup | Ganesh Utsav Tracker" },
      { name: "description", content: "Customize the mandal receipt header, footer, paper size and printed fields." },
      { property: "og:title", content: "Receipt Setup" },
      { property: "og:description", content: "Customize your printed donation receipt." },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const queryClient = useQueryClient();
  const { data } = useReceiptSettings();
  const [form, setForm] = useState<ReceiptSettings | null>(null);

  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  const save = useMutation({
    mutationFn: async (values: ReceiptSettings) => {
      const { error } = await supabase
        .from("receipt_settings")
        .update({
          mandal_name: values.mandal_name,
          header_text: values.header_text,
          footer_text: values.footer_text,
          address: values.address,
          contact: values.contact,
          upi_id: values.upi_id,
          paper_width: values.paper_width,
          show_lane: values.show_lane,
          show_phone: values.show_phone,
          show_collector: values.show_collector,
          show_upi_ref: values.show_upi_ref,
        })
        .eq("id", values.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["receipt-settings"] });
      toast.success("Receipt settings saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!form) return <p className="text-sm text-muted-foreground">Loading…</p>;

  const set = <K extends keyof ReceiptSettings>(key: K, value: ReceiptSettings[K]) =>
    setForm({ ...form, [key]: value });

  const preview = buildReceiptLines(
    {
      id: "preview",
      receipt_no: 1001,
      donor_name: "Ramesh Patil",
      donor_phone: "9876543210",
      lane: "Lane no. 4",
      amount: 501,
      note: null,
      status: "paid",
      upi_ref: "4213XXXX9921",
      collected_by: "preview",
      collected_by_name: "Volunteer",
      paid_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      payment_mode: "online",
      txn_id: `SSMM-${new Date().getFullYear()}-001001`,
    },
    form,
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl">Receipt setup</h1>
        <p className="text-sm text-muted-foreground">Everything here changes what prints on the thermal receipt.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="font-display text-xl">Mandal details</CardTitle>
            <CardDescription>Shown at the top of every receipt.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field label="Header line" value={form.header_text} onChange={(v) => set("header_text", v)} />
            <Field label="Mandal name" value={form.mandal_name} onChange={(v) => set("mandal_name", v)} />
            <div className="space-y-2">
              <Label>Address</Label>
              <Textarea value={form.address ?? ""} rows={2} onChange={(e) => set("address", e.target.value)} />
            </div>
            <Field label="Contact" value={form.contact ?? ""} onChange={(v) => set("contact", v)} />
            <Field label="UPI ID" value={form.upi_id} onChange={(v) => set("upi_id", v)} />
            <Field label="Footer line" value={form.footer_text ?? ""} onChange={(v) => set("footer_text", v)} />
            <div className="space-y-2">
              <Label>Paper width</Label>
              <Select value={form.paper_width} onValueChange={(v) => set("paper_width", v)}>
                <SelectTrigger className="!h-11 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="58mm">58 mm (32 chars)</SelectItem>
                  <SelectItem value="80mm">80 mm (48 chars)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3 border-t border-border pt-4">
              <Toggle label="Show lane" checked={form.show_lane} onChange={(v) => set("show_lane", v)} />
              <Toggle label="Show donor phone" checked={form.show_phone} onChange={(v) => set("show_phone", v)} />
              <Toggle
                label="Show collector name"
                checked={form.show_collector}
                onChange={(v) => set("show_collector", v)}
              />
              <Toggle label="Show UPI reference" checked={form.show_upi_ref} onChange={(v) => set("show_upi_ref", v)} />
            </div>

            <Button className="h-12 w-full" onClick={() => save.mutate(form)} disabled={save.isPending}>
              {save.isPending ? "Saving…" : "Save receipt settings"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="font-display text-xl">Live preview</CardTitle>
            <CardDescription>Sample receipt using your current settings.</CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="overflow-x-auto rounded-md border border-border bg-muted p-3 font-mono text-[11px] leading-tight">
              {preview.join("\n")}
            </pre>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input className="h-11" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between">
      <Label>{label}</Label>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
