export const LANES = [
  "Lane no. 1",
  "Lane no. 2",
  "Lane no. 3",
  "Lane no. 4",
  "Lane no. 5",
  "Lane no. 6",
  "Lane no. 7",
  "Lane no. 8",
  "Lane no. 9",
  "Lane no. 10",
  "Lane no. 11",
  "Main Rd",
  "Shops",
] as const;

export type Lane = (typeof LANES)[number];

export const SHORT_LANE: Record<string, string> = {
  "Lane no. 1": "L1",
  "Lane no. 2": "L2",
  "Lane no. 3": "L3",
  "Lane no. 4": "L4",
  "Lane no. 5": "L5",
  "Lane no. 6": "L6",
  "Lane no. 7": "L7",
  "Lane no. 8": "L8",
  "Lane no. 9": "L9",
  "Lane no. 10": "L10",
  "Lane no. 11": "L11",
  "Main Rd": "Main",
  "Shops": "Shops",
};

export function formatINR(value: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}
