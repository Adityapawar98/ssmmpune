import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useIsAdmin, useSessionUser } from "@/hooks/useAuthUser";
import { supabase } from "@/integrations/supabase/client";
import { AUDIT_CATEGORY_LABELS, type AuditEntry } from "@/lib/audit";
import { formatDateTime } from "@/lib/lanes";

export const Route = createFileRoute("/_authenticated/audit")({
  head: () => ({
    meta: [
      { title: "Audit Log | Ganesh Utsav Tracker" },
      {
        name: "description",
        content: "Admin trail of security changes, receipt prints, downloads and deletions with actor and timestamp.",
      },
      { property: "og:title", content: "Audit Log" },
      { property: "og:description", content: "Who did what, and when, across the donation tracker." },
    ],
  }),
  component: AuditPage,
});

function AuditPage() {
  const { user } = useSessionUser();
  const { data: isAdmin, isLoading: roleLoading } = useIsAdmin(user?.id);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ["audit-log"],
    enabled: !!isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data as unknown as AuditEntry[];
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries.filter(
      (e) =>
        (category === "all" || e.category === category) &&
        (!q ||
          e.actor_name.toLowerCase().includes(q) ||
          e.action.toLowerCase().includes(q) ||
          e.summary.toLowerCase().includes(q) ||
          (e.entity_id ?? "").toLowerCase().includes(q)),
    );
  }, [entries, search, category]);

  if (!roleLoading && !isAdmin) {
    return (
      <Card>
        <CardContent className="py-16 text-center text-sm text-muted-foreground">
          The audit log is visible to admins only.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl">Audit log</h1>
        <p className="text-sm text-muted-foreground">
          Every security change, receipt print, download and deletion — with who did it and when.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <Input
          placeholder="Search actor, action or receipt"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-11 max-w-xs"
        />
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="!h-11 w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All activity</SelectItem>
            <SelectItem value="security">Security</SelectItem>
            <SelectItem value="receipt">Receipt</SelectItem>
            <SelectItem value="ledger">Ledger</SelectItem>
            <SelectItem value="general">General</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="font-display text-xl">Activity</CardTitle>
          <CardDescription>{filtered.length} recorded actions (latest 500).</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {isLoading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
          ) : !filtered.length ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No activity recorded yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">When</th>
                  <th className="py-2 pr-3 font-medium">Who</th>
                  <th className="py-2 pr-3 font-medium">Type</th>
                  <th className="py-2 pr-3 font-medium">Action</th>
                  <th className="py-2 font-medium">Details</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((e) => (
                  <tr key={e.id} className="border-b border-border/60 align-top">
                    <td className="py-2 pr-3 whitespace-nowrap">{formatDateTime(e.created_at)}</td>
                    <td className="py-2 pr-3">{e.actor_name}</td>
                    <td className="py-2 pr-3">
                      <Badge variant={e.category === "security" ? "destructive" : "secondary"}>
                        {AUDIT_CATEGORY_LABELS[e.category] ?? e.category}
                      </Badge>
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap">{e.action}</td>
                    <td className="py-2">{e.summary}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
