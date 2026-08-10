import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ShieldOff, UserCheck, X } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useIsAdmin, useSessionUser, type ApprovalStatus } from "@/hooks/useAuthUser";
import { supabase } from "@/integrations/supabase/client";
import { audit } from "@/lib/audit";
import { formatDateTime } from "@/lib/lanes";

export const Route = createFileRoute("/_authenticated/requests")({
  head: () => ({
    meta: [
      { title: "Login Requests | Ganesh Utsav Tracker" },
      {
        name: "description",
        content: "Approve or reject new volunteer accounts before they can record Ganesh Utsav donations.",
      },
      { property: "og:title", content: "Login Requests" },
      { property: "og:description", content: "Admin approval queue for new accounts." },
    ],
  }),
  component: RequestsPage,
});

type ProfileRow = {
  id: string;
  full_name: string;
  email: string | null;
  created_at: string;
  approval_status: ApprovalStatus;
  approved_at: string | null;
};

const STATUS_LABEL: Record<ApprovalStatus, string> = {
  pending: "Waiting",
  approved: "Approved",
  rejected: "Blocked",
};

function RequestsPage() {
  const queryClient = useQueryClient();
  const { user } = useSessionUser();
  const { data: isAdmin, isLoading: roleLoading } = useIsAdmin(user?.id);
  const [search, setSearch] = useState("");

  const { data: profiles = [], isLoading } = useQuery({
    queryKey: ["login-requests"],
    enabled: !!isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email, created_at, approval_status, approved_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as ProfileRow[];
    },
  });

  const decide = useMutation({
    mutationFn: async ({ row, status }: { row: ProfileRow; status: ApprovalStatus }) => {
      const { error } = await supabase
        .from("profiles")
        .update({
          approval_status: status,
          approved_at: status === "approved" ? new Date().toISOString() : null,
          approved_by: user?.id ?? null,
        })
        .eq("id", row.id);
      if (error) throw error;
      return { row, status };
    },
    onSuccess: ({ row, status }) => {
      const who = row.full_name?.trim() || row.email || row.id;
      audit({
        action: status === "approved" ? "Access approved" : "Access blocked",
        category: "security",
        entity: "profile",
        entityId: row.id,
        summary:
          status === "approved" ? `${who} was approved to use the tracker` : `${who} was blocked from the tracker`,
        details: { email: row.email, status },
      });
      void queryClient.invalidateQueries({ queryKey: ["login-requests"] });
      void queryClient.invalidateQueries({ queryKey: ["pending-requests-count"] });
      toast.success(status === "approved" ? "Access granted" : "Access blocked");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const q = search.trim().toLowerCase();
  const matches = useMemo(
    () =>
      profiles.filter(
        (p) => !q || p.full_name.toLowerCase().includes(q) || (p.email ?? "").toLowerCase().includes(q),
      ),
    [profiles, q],
  );
  const pending = matches.filter((p) => p.approval_status === "pending");
  const others = matches.filter((p) => p.approval_status !== "pending");

  if (!roleLoading && !isAdmin) {
    return (
      <Card>
        <CardContent className="py-16 text-center text-sm text-muted-foreground">
          Login requests are visible to admins only.
        </CardContent>
      </Card>
    );
  }

  function Row({ p }: { p: ProfileRow }) {
    return (
      <div className="flex flex-wrap items-center gap-3 border-b border-border/60 py-3 last:border-0">
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{p.full_name?.trim() || "(no name)"}</p>
          <p className="truncate text-xs text-muted-foreground">
            {p.email} · joined {formatDateTime(p.created_at)}
          </p>
        </div>
        <Badge
          variant={
            p.approval_status === "approved"
              ? "secondary"
              : p.approval_status === "rejected"
                ? "destructive"
                : "outline"
          }
        >
          {STATUS_LABEL[p.approval_status]}
        </Badge>
        <div className="flex gap-2">
          {p.approval_status !== "approved" && (
            <Button size="sm" disabled={decide.isPending} onClick={() => decide.mutate({ row: p, status: "approved" })}>
              <Check className="size-4" /> Approve
            </Button>
          )}
          {p.approval_status !== "rejected" && p.id !== user?.id && (
            <Button
              size="sm"
              variant="outline"
              disabled={decide.isPending}
              onClick={() => decide.mutate({ row: p, status: "rejected" })}
            >
              {p.approval_status === "approved" ? <ShieldOff className="size-4" /> : <X className="size-4" />}
              {p.approval_status === "approved" ? "Revoke" : "Reject"}
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl">Login requests</h1>
        <p className="text-sm text-muted-foreground">
          New accounts stay locked out until you approve them here.
        </p>
      </div>

      <Input
        placeholder="Search name or email"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="h-11 max-w-xs"
      />

      <Card>
        <CardHeader>
          <CardTitle className="font-display text-xl">Waiting for approval</CardTitle>
          <CardDescription>{pending.length} account(s) need a decision.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>
          ) : !pending.length ? (
            <p className="flex items-center justify-center gap-2 py-6 text-center text-sm text-muted-foreground">
              <UserCheck className="size-4" /> No pending requests.
            </p>
          ) : (
            pending.map((p) => <Row key={p.id} p={p} />)
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-display text-xl">All accounts</CardTitle>
          <CardDescription>Approved and blocked people. You can change access any time.</CardDescription>
        </CardHeader>
        <CardContent>
          {!others.length ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Nothing here yet.</p>
          ) : (
            others.map((p) => <Row key={p.id} p={p} />)
          )}
        </CardContent>
      </Card>
    </div>
  );
}
