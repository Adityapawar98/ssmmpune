import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Banknote, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useIsAdmin, useSessionUser } from "@/hooks/useAuthUser";
import { supabase } from "@/integrations/supabase/client";
import { audit } from "@/lib/audit";
import { formatDateTime, formatINR } from "@/lib/lanes";
import type { Tables } from "@/integrations/supabase/types";

export const Route = createFileRoute("/_authenticated/expenses")({
  head: () => ({
    meta: [
      { title: "Expenses | Ganesh Utsav Tracker" },
      { name: "description", content: "Record and review mandal expenses and the amount remaining after expenses." },
      { property: "og:title", content: "Expenses" },
      { property: "og:description", content: "Admin-only expense tracking for the Ganesh Utsav donation ledger." },
    ],
  }),
  component: ExpensesPage,
});

type Expense = Tables<"expenses">;

function ExpensesPage() {
  const queryClient = useQueryClient();
  const { user } = useSessionUser();
  const { data: isAdmin, isLoading: roleLoading } = useIsAdmin(user?.id);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [confirmExpense, setConfirmExpense] = useState<Expense | null>(null);

  const { data: expenses = [], isLoading } = useQuery({
    queryKey: ["expenses"],
    enabled: !!isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase.from("expenses").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data as Expense[];
    },
  });

  const total = useMemo(() => expenses.reduce((sum, expense) => sum + Number(expense.amount), 0), [expenses]);

  const addExpense = useMutation({
    mutationFn: async () => {
      const numericAmount = Number(amount);
      if (!Number.isFinite(numericAmount) || numericAmount <= 0) throw new Error("Enter a valid expense amount");
      if (!reason.trim()) throw new Error("Enter a reason for this expense");
      if (!user?.id) throw new Error("Your session has expired. Please sign in again.");

      const { data, error } = await supabase
        .from("expenses")
        .insert({ amount: numericAmount, reason: reason.trim(), created_by: user.id })
        .select()
        .single();
      if (error) throw error;
      return data as Expense;
    },
    onSuccess: (expense) => {
      setAmount("");
      setReason("");
      void queryClient.invalidateQueries({ queryKey: ["expenses"] });
      audit({
        action: "Expense added",
        category: "ledger",
        entity: "expenses",
        entityId: expense.id,
        summary: `Added expense ${formatINR(Number(expense.amount))} — ${expense.reason}`,
        details: { amount: expense.amount, reason: expense.reason },
      });
      toast.success("Expense added");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteExpense = useMutation({
    mutationFn: async (expense: Expense) => {
      const { error } = await supabase.from("expenses").delete().eq("id", expense.id);
      if (error) throw error;
      return expense;
    },
    onSuccess: (expense) => {
      setConfirmExpense(null);
      void queryClient.invalidateQueries({ queryKey: ["expenses"] });
      audit({
        action: "Expense deleted",
        category: "ledger",
        entity: "expenses",
        entityId: expense.id,
        summary: `Deleted expense ${formatINR(Number(expense.amount))} — ${expense.reason}`,
        details: { amount: expense.amount, reason: expense.reason },
      });
      toast.success("Expense deleted");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (!roleLoading && !isAdmin) {
    return (
      <Card>
        <CardContent className="py-16 text-center text-sm text-muted-foreground">
          Expenses are visible to admins only.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl">Expenses</h1>
        <p className="text-sm text-muted-foreground">Record mandal spending. These amounts are subtracted from the net total.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs tracking-wide text-muted-foreground uppercase">Total expenses</p>
            <p className="font-display mt-1 text-2xl">{formatINR(total)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs tracking-wide text-muted-foreground uppercase">Expense entries</p>
            <p className="font-display mt-1 text-2xl">{expenses.length}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="font-display text-xl">Add expense</CardTitle>
          <CardDescription>Only admins can add or remove expense entries.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-[minmax(0,15rem)_minmax(0,1fr)_auto] sm:items-end">
          <div className="space-y-2">
            <Label htmlFor="expense-amount">Amount (₹)</Label>
            <Input
              id="expense-amount"
              type="number"
              min="0.01"
              step="0.01"
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="0"
              className="h-11"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="expense-reason">Reason</Label>
            <Input
              id="expense-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="e.g. Decoration materials"
              className="h-11"
            />
          </div>
          <Button className="h-11" disabled={addExpense.isPending} onClick={() => addExpense.mutate()}>
            <Banknote className="size-4" /> {addExpense.isPending ? "Saving…" : "Add expense"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-display text-xl">Expense history</CardTitle>
          <CardDescription>{expenses.length} expense entries</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
          ) : !expenses.length ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No expenses recorded yet.</p>
          ) : (
            <div className="space-y-3">
              {expenses.map((expense) => (
                <div key={expense.id} className="flex flex-wrap items-center gap-3 border-b border-border/60 py-3 last:border-0">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{expense.reason}</p>
                    <p className="text-xs text-muted-foreground">{formatDateTime(expense.created_at)}</p>
                  </div>
                  <p className="font-medium">{formatINR(Number(expense.amount))}</p>
                  <Button
                    size="sm"
                    variant="ghost"
                    title="Delete expense"
                    onClick={() => setConfirmExpense(expense)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!confirmExpense} onOpenChange={(open) => !open && setConfirmExpense(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this expense?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes {confirmExpense ? formatINR(Number(confirmExpense.amount)) : "this expense"} from the expense total and net balance.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={!confirmExpense || deleteExpense.isPending}
              onClick={(event) => {
                event.preventDefault();
                if (confirmExpense) deleteExpense.mutate(confirmExpense);
              }}
            >
              {deleteExpense.isPending ? "Deleting…" : "Delete expense"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}