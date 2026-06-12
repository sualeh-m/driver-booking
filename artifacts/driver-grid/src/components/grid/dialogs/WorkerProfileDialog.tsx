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
  useGetWorker,
  useUpdateWorker,
  getGetWorkerQueryKey,
  getGetDashboardSummaryQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

const formSchema = z.object({
  fullName: z.string().min(1, "Name is required"),
  phone: z.string().optional(),
  jobRole: z.string().optional(),
  workerType: z.enum(["HGV", "Warehouse"]),
  note: z.string().optional(),
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

  const workerQuery = useGetWorker(workerId, {
    query: { enabled: open, queryKey: getGetWorkerQueryKey(workerId) },
  });
  const worker = workerQuery.data;
  const updateWorker = useUpdateWorker();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      fullName: "",
      phone: "",
      jobRole: "",
      workerType: "HGV",
      note: "",
    },
  });

  // Seed the form whenever we enter edit mode (from freshly-fetched data).
  useEffect(() => {
    if (editing && worker) {
      form.reset({
        fullName: worker.fullName,
        phone: worker.phone ?? "",
        jobRole: worker.jobRole ?? "",
        workerType: worker.workerType,
        note: note ?? "",
      });
    }
  }, [editing, worker, note, form]);

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
          phone: values.phone?.trim() ? values.phone : null,
          jobRole: values.jobRole?.trim() ? values.jobRole : null,
          workerType: values.workerType,
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
                    <FormControl>
                      <Input placeholder="Class 1 HGV" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="workerType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Worker Type</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="HGV">HGV</SelectItem>
                        <SelectItem value="Warehouse">Warehouse</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
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
              <dd className="col-span-2">{worker.jobRole || "—"}</dd>
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
              {onOpenEvents ? (
                <Button type="button" variant="outline" onClick={onOpenEvents}>
                  Events &amp; history
                </Button>
              ) : (
                <span />
              )}
              <Button type="button" onClick={() => setEditing(true)}>
                Edit
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
