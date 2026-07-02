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
  getListJobTitlesQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { CustomJobTitleInput } from "./CustomJobTitleInput";

const JOB_ROLES = Object.values(JobRole);

// Sensible default role for a new worker, by the sheet's worker type. A
// Warehouse sheet defaults to the Warehouse role; HGV and Both default to the
// first HGV role (the user can change it).
function defaultRoleForSheet(sheet: Sheet | null): string {
  return sheet?.workerType === "Warehouse" ? "Warehouse" : "HGV 1";
}

const formSchema = z
  .object({
    fullName: z.string().min(1, "Name is required"),
    phone: z.string().optional(),
    jobRole: z.enum(JOB_ROLES as [string, ...string[]]),
    customJobTitle: z.string().optional(),
    notes: z.string().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.jobRole === JobRole.Other && !v.customJobTitle?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["customJobTitle"],
        message: 'Job title is required when the role is "Other"',
      });
    }
  });

export function AddWorkerDialog({ open, onOpenChange, sheet, start, end, existingWorkerIds = [] }: { open: boolean, onOpenChange: (o: boolean) => void, sheet: Sheet | null, start: string, end: string, existingWorkerIds?: number[] }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const createWorker = useCreateWorker();
  const addWorkerToSheet = useAddWorkerToSheet();

  // A single combined flow: the Full Name field doubles as a live search box for
  // existing workers. Typing shows matches to pick from (link, no duplicate);
  // if none is the person you mean, keep typing and fill the rest to create new.
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { fullName: "", phone: "", jobRole: defaultRoleForSheet(sheet), customJobTitle: "", notes: "" },
  });

  // Once the user has explicitly picked or dismissed the suggestions we stop
  // showing the live dropdown, so it doesn't reappear while they finish the
  // rest of the form for a genuinely new worker.
  const [suggestionsDismissed, setSuggestionsDismissed] = useState(false);

  // Reset whenever the dialog opens (it's reused across sheets).
  useEffect(() => {
    if (open) {
      setSuggestionsDismissed(false);
      form.reset({ fullName: "", phone: "", jobRole: defaultRoleForSheet(sheet), customJobTitle: "", notes: "" });
    }
  }, [open, sheet, form]);

  // Live existing-worker search driven by the Full Name field.
  const nameValue = form.watch("fullName");
  const trimmedSearch = nameValue.trim();
  const searchParams = trimmedSearch ? { search: trimmedSearch } : undefined;
  const searchEnabled = open && !suggestionsDismissed && trimmedSearch.length > 0;
  const { data: searchResults, isFetching: searchFetching } = useListWorkers(searchParams, {
    query: {
      enabled: searchEnabled,
      queryKey: getListWorkersQueryKey(searchParams),
    },
  });

  const existingSet = new Set(existingWorkerIds);
  const matches = searchEnabled ? (searchResults ?? []) : [];
  const showSuggestions = searchEnabled && (searchFetching || matches.length > 0);

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
      customJobTitle: values.jobRole === JobRole.Other ? values.customJobTitle?.trim() : undefined,
    } }, {
      onSuccess: (worker) => {
        // A new custom title may now exist in the suggestion list.
        queryClient.invalidateQueries({ queryKey: getListJobTitlesQueryKey() });
        link(worker.id, worker.fullName, values.notes);
      },
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
            {sheet
              ? `Start typing a name to link an existing worker, or fill in the form to add a new one to ${sheet.name}.`
              : "Select a sheet first."}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-2">
            <FormField
              control={form.control}
              name="fullName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Full Name *</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Start typing a name…"
                      autoComplete="off"
                      {...field}
                      onChange={(e) => {
                        field.onChange(e);
                        // Typing again re-opens the live suggestions.
                        if (suggestionsDismissed) setSuggestionsDismissed(false);
                      }}
                    />
                  </FormControl>
                  <FormMessage />

                  {showSuggestions && (
                    <div className="mt-1 max-h-56 overflow-auto rounded-md border bg-popover shadow-sm">
                      <div className="flex items-center justify-between px-2 py-1.5">
                        <span className="text-xs text-muted-foreground">
                          Existing workers matching “{trimmedSearch}”
                        </span>
                        <button
                          type="button"
                          className="text-xs text-muted-foreground underline-offset-2 hover:underline"
                          onClick={() => setSuggestionsDismissed(true)}
                        >
                          Dismiss
                        </button>
                      </div>
                      {searchFetching && matches.length === 0 ? (
                        <p className="px-2 pb-2 text-sm text-muted-foreground">Searching…</p>
                      ) : (
                        <ul className="divide-y border-t">
                          {matches.map((w) => {
                            const onSheet = existingSet.has(w.id);
                            return (
                              <li key={w.id}>
                                <button
                                  type="button"
                                  disabled={onSheet || pending || !sheet}
                                  onClick={() => link(w.id, w.fullName)}
                                  className="flex w-full items-center justify-between gap-2 px-2 py-2 text-left hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-transparent"
                                >
                                  <span className="min-w-0">
                                    <span className="block truncate text-sm font-medium">{w.fullName}</span>
                                    <span className="block truncate text-xs text-muted-foreground">
                                      {[w.phone, w.jobRole].filter(Boolean).join(" · ") || "No phone / role"}
                                    </span>
                                  </span>
                                  <span className="shrink-0 text-xs font-medium text-muted-foreground">
                                    {onSheet ? "On this sheet" : "Add"}
                                  </span>
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  )}
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
            {form.watch("jobRole") === JobRole.Other && (
              <FormField
                control={form.control}
                name="customJobTitle"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Job Title *</FormLabel>
                    <FormControl>
                      <CustomJobTitleInput
                        value={field.value ?? ""}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
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
      </DialogContent>
    </Dialog>
  );
}
