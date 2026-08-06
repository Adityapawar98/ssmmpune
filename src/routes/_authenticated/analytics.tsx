import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { formatINR, LANES, SHORT_LANE } from "@/lib/lanes";
import type { Donation } from "@/lib/receipt";

export const Route = createFileRoute("/_authenticated/analytics")({
  head: () => ({
    meta: [
      { title: "Lane Collections | Ganesh Utsav Tracker" },
      { name: "description", content: "Bar graph of total donations collected across 11 lanes and the Main Rd." },
      { property: "og:title", content: "Lane Collections" },
      { property: "og:description", content: "Compare donation totals across all 12 collection areas." },
    ],
  }),
  component: AnalyticsPage,
});

function AnalyticsPage() {
  const [range, setRange] = useState<"30" | "90" | "all">("30");

  const { data: donations = [] } = useQuery({
    queryKey: ["donations"],
    queryFn: async () => {
      const { data, error } = await supabase.from("donations").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data as Donation[];
    },
  });

  const chartData = LANES.map((lane) => ({
    lane,
    short: SHORT_LANE[lane] ?? lane,
    total: donations.filter((d) => d.lane === lane).reduce((s, d) => s + Number(d.amount), 0),
    count: donations.filter((d) => d.lane === lane).length,
  }));

  const grand = chartData.reduce((s, d) => s + d.total, 0);
  const best = chartData.reduce((a, b) => (b.total > a.total ? b : a), chartData[0]!);

  const daily = useMemo(() => {
    const buckets = new Map<string, { total: number; count: number }>();
    for (const d of donations) {
      const key = new Date(d.created_at).toISOString().slice(0, 10);
      const cur = buckets.get(key) ?? { total: 0, count: 0 };
      cur.total += Number(d.amount);
      cur.count += 1;
      buckets.set(key, cur);
    }
    const rows = [...buckets.entries()]
      .map(([day, v]) => ({
        day,
        label: new Date(`${day}T00:00:00`).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }),
        ...v,
      }))
      .sort((a, b) => a.day.localeCompare(b.day));
    if (range === "all") return rows;
    return rows.slice(-Number(range));
  }, [donations, range]);

  const yearly = useMemo(() => {
    const buckets = new Map<string, { total: number; count: number }>();
    for (const d of donations) {
      const year = String(new Date(d.created_at).getFullYear());
      const cur = buckets.get(year) ?? { total: 0, count: 0 };
      cur.total += Number(d.amount);
      cur.count += 1;
      buckets.set(year, cur);
    }
    return [...buckets.entries()].map(([year, v]) => ({ year, ...v })).sort((a, b) => b.year.localeCompare(a.year));
  }, [donations]);

  const today = new Date().toISOString().slice(0, 10);
  const todayTotal = donations
    .filter((d) => new Date(d.created_at).toISOString().slice(0, 10) === today)
    .reduce((s, d) => s + Number(d.amount), 0);
  const currentYear = String(new Date().getFullYear());


  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl">Collection analytics</h1>
        <p className="text-sm text-muted-foreground">All 11 lanes and the Main Rd in one graph.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Total collected" value={formatINR(grand)} />
        <Stat label="Receipts issued" value={String(donations.length)} />
        <Stat label="Top area" value={`${best.lane} · ${formatINR(best.total)}`} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="font-display text-xl">Amount collected per lane</CardTitle>
          <CardDescription>12 bars: Lane no. 1 to 11 plus Main Rd.</CardDescription>
        </CardHeader>
        <CardContent className="h-[420px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
              <XAxis dataKey="short" tick={{ fontSize: 12 }} stroke="var(--color-muted-foreground)" />
              <YAxis tick={{ fontSize: 12 }} stroke="var(--color-muted-foreground)" />
              <Tooltip
                cursor={{ fill: "var(--color-muted)" }}
                formatter={(value: number) => [formatINR(value), "Collected"]}
                labelFormatter={(_l, payload) => payload?.[0]?.payload?.lane ?? ""}
                contentStyle={{
                  background: "var(--color-card)",
                  border: "1px solid var(--color-border)",
                  borderRadius: "0.5rem",
                }}
              />
              <Bar dataKey="total" radius={[6, 6, 0, 0]}>
                {chartData.map((entry) => (
                  <Cell
                    key={entry.lane}
                    fill={entry.lane === "Main Rd" ? "var(--color-chart-3)" : "var(--color-chart-1)"}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-xs tracking-wide text-muted-foreground uppercase">{label}</p>
        <p className="font-display mt-1 text-2xl">{value}</p>
      </CardContent>
    </Card>
  );
}
