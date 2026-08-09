# Make the tracker work cleanly on iPhone, Android and Windows

Goal: the same website, no install needed, behaving correctly in browsers on every device the mandal uses. Nothing that can't work on a device should appear broken — it should quietly fall back to something that does.

## What changes for each device

**iPhone / iPad (Safari)**
- Direct Bluetooth/USB thermal printing is not possible in Safari. Instead of an empty "no printer connected" bar, the printer section explains this and offers **Print receipt** and **Download PDF** as the primary actions.
- Receipt printing currently opens a new window, which Safari often blocks. Printing switches to an in-page print method that works without pop-ups, so the print sheet always appears (AirPrint-capable printers work from here).
- Form inputs get a size that stops Safari from zooming in every time a field is tapped.
- Layout respects the notch / home-bar safe areas so nothing sits under them.

**Android (Chrome)**
- Bluetooth printing stays as-is; the connect flow is unchanged.
- Same pop-up-free printing path, plus the WhatsApp send keeps its current mobile behaviour.

**Windows (Chrome / Edge / Firefox)**
- USB and Bluetooth printing stay for Chrome and Edge. Firefox does not support them, so the bar says so and offers print / PDF instead of dead buttons.

## Layout and touch fixes (all devices)

- Records ledger: on phones the wide table becomes a stacked card list (donor, amount, lane, mode, status, actions) instead of a sideways-scrolling table. Tablet and desktop keep the table.
- Collect screen, analytics cards, filters and the top navigation get checked at phone width so buttons stay reachable and nothing overflows the screen.
- Buttons and rows get comfortable tap sizes for on-ground use.

## Technical notes

- `src/lib/pdf.ts`: replace `window.open` receipt printing with a hidden same-page iframe that writes the receipt markup and calls `print()`, removing pop-up-blocker failures on iOS/Safari and strict Windows setups. Keep the `@page` width rules for 58mm/80mm.
- `src/components/PrinterBar.tsx`: when neither `isBluetoothSupported()` nor `isUsbSupported()` is true, render an explanatory line plus print/PDF guidance rather than an empty state; guard all Web Bluetooth/WebUSB calls behind capability checks (already partially in place).
- `src/routes/__root.tsx`: add `viewport-fit=cover` to the viewport meta and `theme-color`; add safe-area padding utilities in `src/styles.css`.
- `src/styles.css`: base input font-size 16px on small screens (iOS zoom guard), `overflow-wrap` guards, and print styles.
- `src/routes/_authenticated/records.tsx`: add a `md:` breakpoint split — card list below, existing table above. Admin-only bulk delete and ledger export stay exactly as they are now.
- No backend, schema or permission changes.

## Out of scope

- Installable app icon / offline mode and App Store or Play Store builds — not part of this change.
