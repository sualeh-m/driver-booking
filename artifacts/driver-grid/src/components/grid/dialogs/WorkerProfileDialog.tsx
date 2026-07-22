import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { format } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  JobRole,
  useGetWorker,
  useUpdateWorker,
  useDeleteWorker,
  useGetWorkerDeleteImpact,
  useGetCurrentUser,
  getGetWorkerQueryKey,
  getGetWorkerDeleteImpactQueryKey,
  getGetCurrentUserQueryKey,
  getGetDashboardSummaryQueryKey,
  getListLeaversQueryKey,
  getListSubmissionsQueryKey,
  getListJobTitlesQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { MarkLeaverDialog } from "./MarkLeaverDialog";
import { ConfirmDeleteDialog } from "./ConfirmDeleteDialog";
import { CustomJobTitleInput } from "./CustomJobTitleInput";
import { isValidUkMobile, UK_MOBILE_ERROR } from "@/lib/ukMobile";

const JOB_ROLES = Object.values(JobRole);

// Legacy/imported workers may carry a null or non-canonical job role. Seed the
// edit form with a sensible valid role so the dropdown is always on a real
// option: keep the role if it is already canonical, otherwise default by the
// worker's derived type (HGV-typed → first HGV role, else Warehouse).
function seedJobRole(
  jobRole: string | null | undefined,
  workerType: string,
): string {
  if (jobRole && (JOB_ROLES as string[]).includes(jobRole)) return jobRole;
  return workerType === "HGV" ? "HGV 1" : "Warehouse";
}

const formSchema = z
  .object({
    fullName: z.string().min(1, "Name is required"),
    phone: z
      .string()
      .min(1, "Mobile number is required")
      .refine(isValidUkMobile, UK_MOBILE_ERROR),
    jobRole: z.enum(JOB_ROLES as [string, ...string[]]),
    customJobTitle: z.string().optional(),
    note: z.string().optional(),
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

type FormValues = z.infer<typeof formSchema>;

export function WorkerProfileDialog({
  open,
  onOpenChange,
  workerId,
  sheetId,
  note,
  onOpenEvents,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  workerId: number;
  /** When provided, the standing note for this worker+sheet can be edited. */
  sheetId?: number;
  /** Current standing note for the worker on `sheetId` (grid context). */
  note?: string | null;
  /** Opens the Events dialog for this worker (grid context only). */
  onOpenEvents?: () => void;
  /** Called after a successful save so the caller can refresh its own list. */
  onSaved?: () => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [leaverOpen, setLeaverOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const workerQuery = useGetWorker(workerId, {
    query: { enabled: open, queryKey: getGetWorkerQueryKey(workerId) },
  });
  const worker = workerQuery.data;
  const updateWorker = useUpdateWorker();

  const { data: currentUser } = useGetCurrentUser({
    query: { retry: false, queryKey: getGetCurrentUserQueryKey() },
  });
  const isAdmin = currentUser?.role === "admin";
  const deleteWorker = useDeleteWorker();
  const { data: deleteImpact } = useGetWorkerDeleteImpact(workerId, {
    query: {
      enabled: deleteOpen && isAdmin,
      queryKey: getGetWorkerDeleteImpactQueryKey(workerId),
    },
  });

  function handleDeleteWorker() {
    deleteWorker.mutate(
      { id: workerId },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["/api/grid"] });
          queryClient.invalidateQueries({ queryKey: getListLeaversQueryKey() });
          queryClient.invalidateQueries({
            queryKey: getListSubmissionsQueryKey(),
          });
          queryClient.invalidateQueries({
            queryKey: getGetDashboardSummaryQueryKey(),
          });
          queryClient.invalidateQueries({ queryKey: ["/api/reports/operational"] });
          queryClient.invalidateQueries({ queryKey: ["/api/reports/people"] });
          setDeleteOpen(false);
          onOpenChange(false);
          onSaved?.();
          toast({
            title: `${worker?.fullName ?? "Worker"} permanently deleted`,
          });
        },
        onError: (err: unknown) => {
          const body = (err as { data?: { error?: string } } | undefined)?.data;
          toast({
            title: "Could not delete worker",
            description: body?.error ?? "Please try again.",
            variant: "destructive",
          });
        },
      },
    );
  }

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      fullName: "",
      phone: "",
      jobRole: "HGV 1",
      customJobTitle: "",
      note: "",
    },
  });

  // Seed the form BEFORE flipping into edit mode, so every field — including
  // the Job Role <Select> — already holds the worker's current value on its
  // very first render. (Seeding via an effect AFTER the edit form mounted left
  // the Radix Select showing its placeholder instead of the current role.)
  function startEditing() {
    if (!worker) return;
    form.reset({
      fullName: worker.fullName,
      phone: worker.phone ?? "",
      jobRole: seedJobRole(worker.jobRole, worker.workerType),
      customJobTitle: worker.customJobTitle ?? "",
      note: note ?? "",
    });
    setEditing(true);
  }

  // Reset to view mode each time the dialog opens.
  useEffect(() => {
    if (open) setEditing(false);
  }, [open]);

  function onSubmit(values: FormValues) {
    updateWorker.mutate(
      {
        id: workerId,
        data: {
          fullName: values.fullName,
          phone: values.phone,
          jobRole: values.jobRole as (typeof JOB_ROLES)[number],
          customJobTitle:
            values.jobRole === JobRole.Other
              ? (values.customJobTitle?.trim() ?? null)
              : null,
          ...(sheetId !== undefined
            ? { sheetId, note: values.note?.trim() ? values.note : null }
            : {}),
        },
      },
      {
        onSuccess: (updated) => {
          queryClient.invalidateQueries({
            queryKey: getGetWorkerQueryKey(workerId),
          });
          queryClient.invalidateQueries({ queryKey: ["/api/grid"] });
          queryClient.invalidateQueries({
            queryKey: getGetDashboardSummaryQueryKey(),
          });
          // A new custom title may now exist in the suggestion list.
          queryClient.invalidateQueries({
            queryKey: getListJobTitlesQueryKey(),
          });
          onSaved?.();
          toast({ title: `${updated.fullName} updated` });
          setEditing(false);
        },
        onError: (err: unknown) => {
          const body = (err as { data?: { error?: string } } | undefined)?.data;
          toast({
            title: "Could not save changes",
            description: body?.error ?? "Please try again.",
            variant: "destructive",
          });
        },
      },
    );
  }

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {worker ? worker.fullName : "Worker profile"}
          </DialogTitle>
          <DialogDescription>
            {editing
              ? "Update this worker's details and save."
              : "View this worker's details, or edit them."}
          </DialogDescription>
        </DialogHeader>

        {workerQuery.isLoading || !worker ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            {workerQuery.isError ? "Could not load worker." : "Loading…"}
          </div>
        ) : editing ? (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-1">
              <FormField
                control={form.control}
                name="fullName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Full Name *</FormLabel>
                    <FormControl>
                      <Input {...field} />
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
                    <FormLabel>Mobile Number *</FormLabel>
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
                          <SelectValue placeholder="Select a role" />
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
              {sheetId !== undefined && (
                <FormField
                  control={form.control}
                  name="note"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Standing Note</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="e.g. Prefers early starts. No nights."
                          rows={2}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
              <div className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
                Start date{" "}
                <span className="font-medium">
                  {worker.startDate
                    ? format(new Date(worker.startDate), "d MMM yyyy")
                    : "Not started"}
                </span>{" "}
                is set automatically from the first booking and can't be edited.
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEditing(false)}
                  disabled={updateWorker.isPending}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={updateWorker.isPending}>
                  {updateWorker.isPending ? "Saving…" : "Save Changes"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        ) : (
          <div className="space-y-3 pt-1">
            <dl className="grid grid-cols-3 gap-x-3 gap-y-2 text-sm">
              <dt className="text-muted-foreground">Phone</dt>
              <dd className="col-span-2">{worker.phone || "—"}</dd>
              <dt className="text-muted-foreground">Job role</dt>
              <dd className="col-span-2">
                {worker.jobRole === "Other" && worker.customJobTitle
                  ? `${worker.customJobTitle} (Other)`
                  : worker.jobRole || "—"}
              </dd>
              <dt className="text-muted-foreground">Worker type</dt>
              <dd className="col-span-2">{worker.workerType}</dd>
              {sheetId !== undefined && (
                <>
                  <dt className="text-muted-foreground">Standing note</dt>
                  <dd className="col-span-2">{note || "—"}</dd>
                </>
              )}
              <dt className="text-muted-foreground">Start date</dt>
              <dd className="col-span-2">
                {worker.startDate
                  ? format(new Date(worker.startDate), "d MMM yyyy")
                  : "Not started"}
              </dd>
              <dt className="text-muted-foreground">Status</dt>
              <dd className="col-span-2 capitalize">
                {worker.status}
                {worker.doNotBook ? " · Do Not Book" : ""}
              </dd>
            </dl>
            <DialogFooter className="gap-2 sm:justify-between">
              <div className="flex gap-2">
                {onOpenEvents && (
                  <Button type="button" variant="outline" onClick={onOpenEvents}>
                    Events &amp; history
                  </Button>
                )}
                {worker.status === "active" && (
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={() => setLeaverOpen(true)}
                  >
                    Mark as Leaver
                  </Button>
                )}
                {isAdmin && (
                  <Button
                    type="button"
                    variant="outline"
                    className="text-destructive hover:text-destructive"
                    onClick={() => setDeleteOpen(true)}
                  >
                    Delete
                  </Button>
                )}
              </div>
              <Button type="button" onClick={startEditing}>
                Edit
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>

    {worker && (
      <MarkLeaverDialog
        open={leaverOpen}
        onOpenChange={setLeaverOpen}
        workerId={workerId}
        workerName={worker.fullName}
        onSaved={() => {
          // Refetch the worker so status flips to "left" and the destructive
          // button disappears — prevents a second submission in the same open
          // profile (backend also rejects a repeat with 409).
          queryClient.invalidateQueries({
            queryKey: getGetWorkerQueryKey(workerId),
          });
          onSaved?.();
        }}
      />
    )}

    {worker && (
      <ConfirmDeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`Permanently delete ${worker.fullName}?`}
        description="This erases the worker entirely — it is NOT the same as marking them as a leaver."
        impact={
          <>
            This permanently removes{" "}
            <span className="font-semibold">{worker.fullName}</span> and all of
            their data:
            <ul className="mt-1 list-disc pl-5">
              <li>{deleteImpact?.bookings ?? 0} booking{(deleteImpact?.bookings ?? 0) === 1 ? "" : "s"}</li>
              <li>{deleteImpact?.submissions ?? 0} submission{(deleteImpact?.submissions ?? 0) === 1 ? "" : "s"}</li>
              <li>{deleteImpact?.events ?? 0} event{(deleteImpact?.events ?? 0) === 1 ? "" : "s"} (no-shows)</li>
              <li>{deleteImpact?.workerSheets ?? 0} sheet link{(deleteImpact?.workerSheets ?? 0) === 1 ? "" : "s"}</li>
              {deleteImpact?.hasLeaverRecord && <li>their leaver record</li>}
            </ul>
            They will disappear from every KPI report. To keep their history for
            reporting, use <span className="font-semibold">Mark as Leaver</span>{" "}
            instead. This cannot be undone.
          </>
        }
        confirmLabel="Delete worker"
        pending={deleteWorker.isPending}
        onConfirm={handleDeleteWorker}
      />
    )}
    </>
  );
}
