import { createFileRoute, Link, Outlet, redirect, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { BarChart3, Clock, FileText, LogOut, Receipt, Settings, ShieldCheck, UserCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useApprovalStatus, useIsAdmin, usePendingRequestCount, useSessionUser } from "@/hooks/useAuthUser";
import { useDonationsRealtime } from "@/hooks/useDonationsRealtime";
import { supabase } from "@/integrations/supabase/client";
import { audit, resetAuditActorCache } from "@/lib/audit";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/" });
    return { user: data.user };
  },
  component: AuthenticatedLayout,
});

const NAV = [
  { to: "/dashboard", label: "Collect", icon: Receipt, adminOnly: false },
  { to: "/records", label: "Records", icon: FileText, adminOnly: false },
  { to: "/analytics", label: "Analytics", icon: BarChart3, adminOnly: true },
  { to: "/settings", label: "Receipt setup", icon: Settings, adminOnly: true },
  { to: "/audit", label: "Audit log", icon: ShieldCheck, adminOnly: true },
  { to: "/requests", label: "Login requests", icon: UserCheck, adminOnly: true },
] as const;

function AuthenticatedLayout() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useSessionUser();
  const { data: isAdmin } = useIsAdmin(user?.id);
  const { data: approval, isLoading: approvalLoading } = useApprovalStatus(user?.id);
  const { data: pendingCount = 0 } = usePendingRequestCount(!!isAdmin);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  useDonationsRealtime(approval === "approved");

  async function signOut() {
    audit({
      action: "Signed out",
      category: "security",
      summary: `${user?.email ?? "A user"} signed out of the tracker`,
    });
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    resetAuditActorCache();
    navigate({ to: "/", replace: true });
  }

  const blocked = !!user && !approvalLoading && approval !== "approved";



  return (
    <div className="flex min-h-screen flex-col bg-background">
      <div className="festive-band h-1.5" aria-hidden />
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3">
          <div className="mr-auto">
            <p className="font-display text-lg leading-tight">Shantinagar Sarvajanik Mitra Mandal</p>
            <p className="text-xs text-muted-foreground">
              {user?.email} · {isAdmin ? "Admin" : "Collector"}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={signOut}>
            <LogOut className="size-4" /> Sign out
          </Button>
        </div>
        {!blocked && (
          <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-2 pb-2">
            {NAV.filter((item) => !item.adminOnly || isAdmin).map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors",
                  pathname === item.to
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-secondary hover:text-secondary-foreground",
                )}
              >
                <item.icon className="size-4" />
                {item.label}
                {item.to === "/requests" && pendingCount > 0 && (
                  <span className="ml-1 rounded-full bg-destructive px-2 py-0.5 text-xs font-semibold text-destructive-foreground">
                    {pendingCount}
                  </span>
                )}
              </Link>
            ))}
          </nav>
        )}
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        {blocked ? (
          <Card className="mx-auto max-w-lg">
            <CardContent className="space-y-4 py-12 text-center">
              <Clock className="mx-auto size-10 text-primary" />
              <h1 className="font-display text-2xl">
                {approval === "rejected" ? "Access not allowed" : "Waiting for admin approval"}
              </h1>
              <p className="text-sm text-muted-foreground">
                {approval === "rejected"
                  ? "An admin has blocked this account. Please contact the mandal admin if this is a mistake."
                  : "Your account has been created. An admin of the mandal needs to approve it before you can record donations."}
              </p>
              <Button variant="outline" onClick={signOut}>
                <LogOut className="size-4" /> Sign out
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Outlet />
        )}
      </main>

    </div>
  );
}
