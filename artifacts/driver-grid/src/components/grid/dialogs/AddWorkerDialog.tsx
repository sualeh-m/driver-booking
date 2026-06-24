import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Sheet } from "@workspace/api-client-react";
import {
  JobRole,
  useCreateWorker,
  useAddWorkerToSheet,
  useListWorkers,
  getListWorkersQueryKey,
  getGetGridQueryKey,
  getGetDashboardSummaryQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

const JOB_ROLES = Object.values(JobRole);

// Sensible default role for a new worker, by the sheet's worker type. A
// Warehouse sheet defaults to the Warehouse role; HGV and Both default to the
// first HGV role (the user can change it).
function defaultRoleForSheet(sheet: Sheet | null): string {
  return sheet?.workerType === "Warehouse" ? "Warehouse" : "HGV 1";
}

const formSchema = z.object({
  fullName: z.string().min(1, "Name is required"),
  phone: z.string().optional(),
  jobRole: z.enum(JOB_ROLES as [string, ...string[]]),
  notes: z.string().optional(),
});

type Mode = "new" | "existing";

export function AddWorkerDialog({ open, onOpenChange, sheet, start, end, existingWorkerIds = [] }: { open: boolean, onOpenChange: (o: boolean) => void, sheet: Sheet | null, start: string, end: string, existingWorkerIds?: number[] }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const createWorker = useCreateWorker();
  const addWorkerToSheet = useAddWorkerToSheet();

  const [mode, setMode] = useState<Mode>("new");
  const [search, setSearch] = useState("");

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { fullName: "", phone: "", jobRole: defaultRoleForSheet(sheet), notes: "" },
  });

  // Reset both modes whenever the dialog opens (it's reused across sheets).
  useEffect(() => {
    if (open) {
      setMode("new");
      setSearch("");
      form.reset({ fullName: "", phone: "", jobRole: defaultRoleForSheet(sheet), notes: "" });
    }
  }, [open, sheet, form]);

  // Existing-worker search. Only runs in "existing" mode while the dialog is
  // open. An empty search lists everyone (handy on small teams).
  const trimmedSearch = search.trim();
  const searchParams = trimmedSearch ? { search: trimmedSearch } : undefined;
  const { data: searchResults, isFetching: searchFetching } = useListWorkers(searchParams, {
    query: {
      enabled: open && mode === "existing",
      queryKey: getListWorkersQueryKey(searchParams),
    },
  });

  const existingSet = new Set(existingWorkerIds);

  const pending = createWorker.isPending || addWorkerToSheet.isPending;

  function link(workerId: number, workerName: string, notes?: string) {
    if (!sheet) return;
    addWorkerToSheet.mutate({
      sheetId: sheet.id,
      data: { workerId, notes: notes || undefined },
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetGridQueryKey({ sheetId: sheet.id, start, end }) });
        queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
        toast({ title: `${workerName} added to ${sheet.name}` });
        onOpenChange(false);
        form.reset();
      },
      onError: () => toast({ title: "Failed to link worker to sheet", variant: "destructive" }),
    });
  }

  function onSubmit(values: z.infer<typeof formSchema>) {
    if (!sheet) return;
    createWorker.mutate({ data: {
      fullName: values.fullName,
      phone: values.phone || undefined,
      jobRole: values.jobRole as (typeof JOB_ROLES)[number],
    } }, {
      onSuccess: (worker) => link(worker.id, worker.fullName, values.notes),
      onError: () => toast({ title: "Failed to create worker", variant: "destructive" }),
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => {
      onOpenChange(o);
      if (!o) form.reset();
    }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Worker</DialogTitle>
          <DialogDescription>
            {sheet ? `Add a worker to ${sheet.name}.` : "Select a sheet first."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-1 rounded-md bg-muted p-1">
          <Button
            type="button"
            variant={mode === "new" ? "default" : "ghost"}
            size="sm"
            onClick={() => setMode("new")}
          >
            Create new
          </Button>
          <Button
            type="button"
            variant={mode === "existing" ? "default" : "ghost"}
            size="sm"
            onClick={() => setMode("existing")}
          >
            Add existing
          </Button>
        </div>

        {mode === "new" ? (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-2">
              <FormField
                control={form.control}
                name="fullName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Full Name *</FormLabel>
                    <FormControl>
                      <Input placeholder="Tom Bradley" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone</FormLabel>
                    <FormControl>
                      <Input placeholder="07700 900000" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="jobRole"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Job Role</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {JOB_ROLES.map((role) => (
                          <SelectItem key={role} value={role}>{role}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Standing Note</FormLabel>
                    <FormControl>
                      <Textarea placeholder="e.g. Prefers early starts. No nights." rows={2} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                <Button type="submit" disabled={pending || !sheet}>
                  {pending ? "Adding..." : "Add Worker"}
                </Button>
              </div>
            </form>
          </Form>
        ) : (
          <div className="space-y-3 pt-2">
            <Input
              placeholder="Search by name, phone, or role"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
            <div className="max-h-72 overflow-auto rounded-md border">
              {searchFetching && (!searchResults || searchResults.length === 0) ? (
                <p className="p-3 text-sm text-muted-foreground">Searching…</p>
              ) : !searchResults || searchResults.length === 0 ? (
                <p className="p-3 text-sm text-muted-foreground">No workers found.</p>
              ) : (
                <ul className="divide-y">
                  {searchResults.map((w) => {
                    const onSheet = existingSet.has(w.id);
                    return (
                      <li key={w.id} className="flex items-center justify-between gap-2 p-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{w.fullName}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {[w.jobRole, w.phone].filter(Boolean).join(" · ") || "—"}
                          </p>
                        </div>
                        {onSheet ? (
                          <span className="shrink-0 text-xs text-muted-foreground">On this sheet</span>
                        ) : (
                          <Button
                            type="button"
                            size="sm"
                            disabled={pending || !sheet}
                            onClick={() => link(w.id, w.fullName)}
                          >
                            Add
                          </Button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            <div className="flex justify-end pt-1">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
