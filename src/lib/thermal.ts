/**
 * Direct thermal-printer support: pairs an ESC/POS printer over Web Bluetooth
 * or WebUSB and streams raw bytes, so receipts print with no browser dialog.
 */

const ESC = 0x1b;
const GS = 0x1d;

type Writer = (data: Uint8Array) => Promise<void>;

export type ThermalConnection = {
  kind: "bluetooth" | "usb";
  name: string;
  write: Writer;
  disconnect: () => Promise<void>;
};

export function isBluetoothSupported(): boolean {
  return typeof navigator !== "undefined" && "bluetooth" in navigator;
}

export function isUsbSupported(): boolean {
  return typeof navigator !== "undefined" && "usb" in navigator;
}

/** Standard serial-over-BLE service used by most 58mm/80mm receipt printers. */
const PRINTER_SERVICES = [0x18f0, 0xff00, 0xffe0, "000018f0-0000-1000-8000-00805f9b34fb"];

export async function connectBluetoothPrinter(): Promise<ThermalConnection> {
  const bt = (navigator as unknown as { bluetooth: any }).bluetooth;
  const device = await bt.requestDevice({
    acceptAllDevices: true,
    optionalServices: PRINTER_SERVICES,
  });
  const server = await device.gatt.connect();
  const services = await server.getPrimaryServices();
  let characteristic: any = null;
  for (const service of services) {
    const chars = await service.getCharacteristics();
    const writable = chars.find((c: any) => c.properties.write || c.properties.writeWithoutResponse);
    if (writable) {
      characteristic = writable;
      break;
    }
  }
  if (!characteristic) throw new Error("No writable characteristic found on this printer.");

  return {
    kind: "bluetooth",
    name: device.name ?? "Bluetooth printer",
    write: async (data) => {
      // BLE payloads must be chunked.
      const chunkSize = 180;
      for (let i = 0; i < data.length; i += chunkSize) {
        const chunk = data.slice(i, i + chunkSize);
        if (characteristic.properties.writeWithoutResponse) {
          await characteristic.writeValueWithoutResponse(chunk);
        } else {
          await characteristic.writeValue(chunk);
        }
        await new Promise((r) => setTimeout(r, 20));
      }
    },
    disconnect: async () => {
      try {
        device.gatt.disconnect();
      } catch {
        /* ignore */
      }
    },
  };
}

export async function connectUsbPrinter(): Promise<ThermalConnection> {
  const usb = (navigator as unknown as { usb: any }).usb;
  const device = await usb.requestDevice({ filters: [{ classCode: 7 }, {}] });
  await device.open();
  if (device.configuration === null) await device.selectConfiguration(1);
  const iface = device.configuration.interfaces.find((i: any) =>
    i.alternates.some((a: any) => a.endpoints.some((e: any) => e.direction === "out")),
  );
  if (!iface) throw new Error("No printable USB interface found.");
  await device.claimInterface(iface.interfaceNumber);
  const alternate = iface.alternates.find((a: any) => a.endpoints.some((e: any) => e.direction === "out"));
  const endpoint = alternate.endpoints.find((e: any) => e.direction === "out");

  return {
    kind: "usb",
    name: device.productName ?? "USB printer",
    write: async (data) => {
      await device.transferOut(endpoint.endpointNumber, data);
    },
    disconnect: async () => {
      try {
        await device.close();
      } catch {
        /* ignore */
      }
    },
  };
}

/** Turn plain receipt lines into ESC/POS bytes with a header emphasis and paper cut. */
export function encodeEscPos(lines: string[]): Uint8Array {
  const bytes: number[] = [];
  const push = (...b: number[]) => bytes.push(...b);
  const text = (s: string) => {
    for (const ch of s) {
      const code = ch.charCodeAt(0);
      push(code < 128 ? code : 63);
    }
  };

  push(ESC, 0x40); // initialise
  push(ESC, 0x61, 0x00); // left align

  lines.forEach((line, index) => {
    if (index === 1) push(ESC, 0x45, 0x01); // bold mandal name
    text(line);
    push(0x0a);
    if (index === 1) push(ESC, 0x45, 0x00);
  });

  push(0x0a, 0x0a, 0x0a);
  push(GS, 0x56, 0x42, 0x00); // partial cut
  return new Uint8Array(bytes);
}

export async function printLines(connection: ThermalConnection, lines: string[]): Promise<void> {
  await connection.write(encodeEscPos(lines));
}
