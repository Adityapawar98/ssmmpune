import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

/**
 * Keeps every signed-in device in sync: any insert, update or delete on
 * donations refreshes the shared ledger, dashboard and analytics data.
 */
export function useDonationsRealtime(enabled = true) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!enabled) return;
    const channel = supabase
      .channel("donations-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "donations" }, () => {
        void queryClient.invalidateQueries({ queryKey: ["donations"] });
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient, enabled]);
}
