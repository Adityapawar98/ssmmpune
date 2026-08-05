import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";

import { Card, CardContent } from "@/components/ui/card";
import { formatINR } from "@/lib/lanes";

export function UpiQr({
  uri,
  amount,
  upiId,
}: {
  uri: string;
  amount: number;
  upiId: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    QRCode.toCanvas(canvasRef.current, uri, { width: 260, margin: 1 })
      .then(() => setError(null))
      .catch((e: Error) => setError(e.message));
  }, [uri]);

  return (
    <Card className="border-primary/40 bg-card">
      <CardContent className="flex flex-col items-center gap-3 pt-6">
        <p className="text-sm text-muted-foreground">Scan to pay exactly</p>
        <p className="font-display text-3xl text-primary">{formatINR(amount)}</p>
        <canvas ref={canvasRef} className="rounded-lg bg-white p-2" />
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <p className="text-xs text-muted-foreground">{upiId}</p>
        <p className="text-center text-xs text-muted-foreground">
          The amount is locked into the QR — the donor cannot change it in their UPI app.
        </p>
      </CardContent>
    </Card>
  );
}
