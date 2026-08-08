import { supabase } from "@/integrations/supabase/client";

export type AuditCategory = "security" | "receipt" | "ledger" | "general";

export type AuditEntry = {
  id: string;
  actor_id: string;
  actor_name: string;
  action: string;
  category: string;
  entity: string | null;
  entity_id: string | null;
  summary: string;
  details: Record<string, unknown> | null;
  created_at: string;
};

export const AUDIT_CATEGORY_LABELS: Record<string, string> = {
  security: "Security",
  receipt: "Receipt",
  ledger: "Ledger",
  general: "General",
};

type LogInput = {
  action: string;
  category: AuditCategory;
  summary: string;
  entity?: string;
  entityId?: string | number | null;
  details?: Record<string, unknown>;
};

let cachedActor: { id: string; name: string } | null = null;

async function resolveActor() {
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) return null;
  if (cachedActor?.id === user.id) return cachedActor;

  const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle();
  cachedActor = {
    id: user.id,
    name: profile?.full_name?.trim() || user.email || "Unknown user",
  };
  return cachedActor;
}

/**
 * Records an action in the admin audit log.
 * Fire-and-forget: logging must never block or break the user action.
 */
export async function logAudit(input: LogInput): Promise<void> {
  try {
    const actor = await resolveActor();
    if (!actor) return;
    await supabase.from("audit_log").insert({
      actor_id: actor.id,
      actor_name: actor.name,
      action: input.action,
      category: input.category,
      entity: input.entity ?? null,
      entity_id: input.entityId != null ? String(input.entityId) : null,
      summary: input.summary,
      details: (input.details ?? {}) as never,
    });
  } catch {
    // Audit logging is best-effort and intentionally silent.
  }
}

export function audit(input: LogInput): void {
  void logAudit(input);
}

export function resetAuditActorCache() {
  cachedActor = null;
}
