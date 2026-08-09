import { useEffect, useState } from "react";
import { Bluetooth, Printer, Usb, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  connectBluetoothPrinter,
  connectUsbPrinter,
  isBluetoothSupported,
  isUsbSupported,
  printLines,
  type ThermalConnection,
} from "@/lib/thermal";

let sharedConnection: ThermalConnection | null = null;
const listeners = new Set<(c: ThermalConnection | null) => void>();

function setShared(c: ThermalConnection | null) {
  sharedConnection = c;
  listeners.forEach((l) => l(c));
}

export function useThermalPrinter() {
  const [connection, setConnection] = useState<ThermalConnection | null>(sharedConnection);

  useEffect(() => {
    listeners.add(setConnection);
    return () => {
      listeners.delete(setConnection);
    };
  }, []);

  return {
    connection,
    async connect(kind: "bluetooth" | "usb") {
      try {
        const conn = kind === "bluetooth" ? await connectBluetoothPrinter() : await connectUsbPrinter();
        setShared(conn);
        toast.success(`Connected to ${conn.name}`);
      } catch (e) {
        toast.error((e as Error).message || "Could not connect to the printer");
      }
    },
    async disconnect() {
      if (sharedConnection) await sharedConnection.disconnect();
      setShared(null);
    },
    async print(lines: string[]) {
      if (!sharedConnection) throw new Error("No printer connected");
      await printLines(sharedConnection, lines);
    },
  };
}

export function PrinterBar() {
  const { connection, connect, disconnect } = useThermalPrinter();

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-secondary/50 px-3 py-2">
      <Printer className="size-4 text-primary" />
      {connection ? (
        <>
          <span className="text-sm font-medium">Connected: {connection.name}</span>
          <Button variant="ghost" size="sm" onClick={() => void disconnect()}>
            <X className="size-4" /> Disconnect
          </Button>
        </>
      ) : (
        <>
          <span className="text-sm text-muted-foreground">No thermal printer connected</span>
          {isBluetoothSupported() ? (
            <Button variant="outline" size="sm" onClick={() => void connect("bluetooth")}>
              <Bluetooth className="size-4" /> Bluetooth
            </Button>
          ) : null}
          {isUsbSupported() ? (
            <Button variant="outline" size="sm" onClick={() => void connect("usb")}>
              <Usb className="size-4" /> USB
            </Button>
          ) : null}
          {!isBluetoothSupported() && !isUsbSupported() ? (
            <span className="text-xs text-muted-foreground">
              This device can&apos;t connect to a thermal printer directly (iPhone, iPad and Firefox don&apos;t
              support it). Use <strong>Print receipt</strong> or <strong>Download PDF</strong> below — an
              AirPrint or shared printer works from there.
            </span>
          ) : null}

        </>
      )}
    </div>
  );
}
