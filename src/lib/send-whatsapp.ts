import { toast } from "sonner";

import { buildWhatsappText, openWhatsapp, waPhone, type Donation, type ReceiptSettings } from "@/lib/receipt";

/** Open WhatsApp with the receipt, falling back to copying the text. */
export function sendWhatsappReceipt(donation: Donation, settings: ReceiptSettings) {
  if (!waPhone(donation.donor_phone)) {
    toast.error("No valid donor phone number on this receipt.");
    return;
  }
  const text = buildWhatsappText(donation, settings);
  const opened = openWhatsapp(donation, settings);
  if (opened) {
    toast.success("Opening WhatsApp…", {
      description: "If it does not open, copy the receipt text instead.",
      action: { label: "Copy text", onClick: () => void navigator.clipboard.writeText(text) },
    });
    return;
  }
  void navigator.clipboard.writeText(text);
  toast.error("WhatsApp could not be opened", {
    description: "Receipt text copied — paste it into WhatsApp manually.",
  });
}
