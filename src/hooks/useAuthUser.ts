import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { User } from "@supabase/supabase-js";

import { supabase } from "@/integrations/supabase/client";

export function useSessionUser() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    supabase.auth.getUser().then(({ data }) => {
      if (!active) return;
      setUser(data.user ?? null);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return { user, loading };
}

export function useIsAdmin(userId: string | undefined) {
  return useQuery({
    queryKey: ["is-admin", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId!)
        .eq("role", "admin")
        .maybeSingle();
      if (error) throw error;
      return !!data;
    },
  });
}

export function useProfile(userId: string | undefined) {
  return useQuery({
    queryKey: ["profile", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export type ApprovalStatus = "pending" | "approved" | "rejected";

export function useApprovalStatus(userId: string | undefined) {
  return useQuery({
    queryKey: ["approval-status", userId],
    enabled: !!userId,
    queryFn: async (): Promise<ApprovalStatus> => {
      const { data, error } = await supabase
        .from("profiles")
        .select("approval_status")
        .eq("id", userId!)
        .maybeSingle();
      if (error) throw error;
      return (data?.approval_status ?? "pending") as ApprovalStatus;
    },
  });
}

export function usePendingRequestCount(enabled: boolean) {
  return useQuery({
    queryKey: ["pending-requests-count"],
    enabled,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("approval_status", "pending");
      if (error) throw error;
      return count ?? 0;
    },
  });
}

export function useReceiptSettings() {
  return useQuery({
    queryKey: ["receipt-settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("receipt_settings").select("*").limit(1).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}
