import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useIsAdmin, useSessionUser } from "@/hooks/useAuthUser";
import { supabase } from "@/integrations/supabase/client";

import { formatINR, LANES, SHORT_LANE } from "@/lib/lanes";
import type { Donation } from "@/lib/receipt";

export const Route = createFileRoute("/_authenticated/analytics")({
  head: () => ({
    meta: [
      { title: "Collection Analytics | Ganesh Utsav Tracker" },
      { name: "description", content: "Review lane collections, daily donations, yearly totals, and the admin net balance." },
      { property: "og:title", content: "Collection Analytics" },
      { property: "og:description", content: "Compare donation totals across all 12 collection areas and review the net balance." },
    ],
  }),
  component: AnalyticsPage,
});

function AnalyticsPage() {
  const { user } = useSessionUser();
  const { data: isAdmin } = useIsAdmin(user?.id);
  const [range, setRange] = useState<"30" | "90" | "all">("30");


  const { data: donations = [] } = useQuery({
    queryKey: ["donations"],
    queryFn: async () => {
      const { data, error } = await supabase.from("donations").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data as Donation[];
    },
  });

  const { data: expenses = [] } = useQuery({
    queryKey: ["expenses"],
    enabled: !!isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase.from("expenses").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const chartData = LANES.map((lane) => ({
    lane,
    short: SHORT_LANE[lane] ?? lane,
    total: donations.filter((d) => d.lane === lane).reduce((s, d) => s + Number(d.amount), 0),
    count: donations.filter((d) => d.lane === lane).length,
  }));

  const grand = chartData.reduce((s, d) => s + d.total, 0);
  const expenseTotal = expenses.reduce((s, expense) => s + Number(expense.amount), 0);
  const netTotal = grand - expenseTotal;
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

      <div className="grid gap-4 sm:grid-cols-4">
        <Stat label="Total collected" value={formatINR(grand)} />
        {isAdmin ? <Stat label="Total expenses" value={formatINR(expenseTotal)} /> : null}
        {isAdmin ? <Stat label="Net total" value={formatINR(netTotal)} /> : null}
        <Stat label="Collected today" value={formatINR(todayTotal)} />
        <Stat label="Receipts issued" value={String(donations.length)} />
        <Stat label="Top area" value={`${best.lane} · ${formatINR(best.total)}`} />
      </div>

      <Card>
        <CardHeader className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="font-display text-xl">Daily collection</CardTitle>
            <CardDescription>Amount collected each day receipts were issued.</CardDescription>
          </div>
          <div className="flex gap-2">
            {(["30", "90", "all"] as const).map((r) => (
              <Button key={r} size="sm" variant={range === r ? "default" : "outline"} onClick={() => setRange(r)}>
                {r === "all" ? "All days" : `Last ${r}`}
              </Button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="h-[320px]">
          {daily.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={daily} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="var(--color-muted-foreground)" />
                <YAxis tick={{ fontSize: 12 }} stroke="var(--color-muted-foreground)" />
                <Tooltip
                  formatter={(value: number) => [formatINR(value), "Collected"]}
                  contentStyle={{
                    background: "var(--color-card)",
                    border: "1px solid var(--color-border)",
                    borderRadius: "0.5rem",
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="total"
                  stroke="var(--color-chart-2)"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p className="py-16 text-center text-sm text-muted-foreground">No donations recorded yet.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-display text-xl">Total collection per year</CardTitle>
          <CardDescription>Every calendar year of the Utsav so far.</CardDescription>
        </CardHeader>
        <CardContent>
          {yearly.length ? (
            <div className="grid gap-3 sm:grid-cols-3">
              {yearly.map((y) => (
                <div
                  key={y.year}
                  className={`rounded-lg border p-4 ${y.year === currentYear ? "border-primary bg-primary/5" : "border-border"}`}
                >
                  <p className="text-xs tracking-wide text-muted-foreground uppercase">
                    {y.year}
                    {y.year === currentYear ? " · this year" : ""}
                  </p>
                  <p className="font-display mt-1 text-2xl">{formatINR(y.total)}</p>
                  <p className="text-xs text-muted-foreground">{y.count} receipts</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">No donations recorded yet.</p>
          )}
        </CardContent>
      </Card>

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
