import { useMemo, useState } from "react";
import {
  useListSubmissions,
  useListSheets,
  useUpdateSubmissionOutcome,
  useDeleteSubmission,
  useGetCurrentUser,
  getListSubmissionsQueryKey,
  getGetCurrentUserQueryKey,
  type SubmissionOutcome,
  type CpcTestStatus,
  type ListSubmissionsParams,
} from "@workspace/api-client-react";
import { format } from "date-fns";
import { TrashIcon } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { RecordSubmissionDialog } from "@/components/grid/dialogs/RecordSubmissionDialog";
import { WorkerProfileDialog } from "@/components/grid/dialogs/WorkerProfileDialog";
import { ConfirmDeleteDialog } from "@/components/grid/dialogs/ConfirmDeleteDialog";
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

export const SUBMISSION_OUTCOMES: SubmissionOutcome[] = [
  "submitted",
  "cpc_failed",
  "test_failed",
  "passed",
  "rejected",
];

export const SUBMISSION_OUTCOME_LABELS: Record<SubmissionOutcome, string> = {
  submitted: "Submitted",
  cpc_failed: "CPC Failed",
  test_failed: "Test Failed",
  passed: "Passed",
  rejected: "Rejected",
};

const OUTCOME_VARIANT: Record<SubmissionOutcome, "secondary" | "default" | "destructive"> = {
  submitted: "secondary",
  cpc_failed: "destructive",
  test_failed: "destructive",
  passed: "default",
  rejected: "destructive",
};

const CPC_TEST_STATUSES: CpcTestStatus[] = ["pending", "passed", "failed"];

const CPC_TEST_STATUS_LABELS: Record<CpcTestStatus, string> = {
  pending: "Pending",
  passed: "Passed",
  failed: "Failed",
};

const CPC_TEST_STATUS_CLASS: Record<CpcTestStatus, string> = {
  pending: "text-muted-foreground",
  passed: "text-green-700 dark:text-green-400 font-medium",
  failed: "text-destructive font-medium",
};

const ALL_SHEETS = "__all__";

export function Submissions() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [sheetFilter, setSheetFilter] = useState<string>(ALL_SHEETS);
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");
  const [recordOpen, setRecordOpen] = useState(false);
  const [profileFor, setProfileFor] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; workerName: string } | null>(null);
  const [unpassTarget, setUnpassTarget] = useState<{
    id: number;
    workerName: string;
    outcome: SubmissionOutcome;
  } | null>(null);

  const { data: currentUser } = useGetCurrentUser({
    query: { retry: false, queryKey: getGetCurrentUserQueryKey() },
  });
  const isAdmin = currentUser?.role === "admin";

  const { data: sheets } = useListSheets();

  const params: ListSubmissionsParams = useMemo(() => {
    const p: ListSubmissionsParams = {};
    if (sheetFilter !== ALL_SHEETS) p.sheetId = Number(sheetFilter);
    if (from) p.from = from;
    if (to) p.to = to;
    return p;
  }, [sheetFilter, from, to]);

  const { data: submissions, isLoading } = useListSubmissions(params, {
    query: { queryKey: getListSubmissionsQueryKey(params) },
  });

  const update = useUpdateSubmissionOutcome();
  const deleteSubmission = useDeleteSubmission();

  const handleDeleteSubmission = () => {
    if (!deleteTarget) return;
    const { id, workerName } = deleteTarget;
    deleteSubmission.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["/api/submissions"] });
          queryClient.invalidateQueries({ queryKey: ["/api/reports/people"] });
          setDeleteTarget(null);
          toast({ title: `Submission for ${workerName} deleted` });
        },
        onError: () =>
          toast({ title: "Could not delete submission", variant: "destructive" }),
      },
    );
  };

  const applyUpdate = (
    id: number,
    data: { outcome?: SubmissionOutcome; cpcStatus?: CpcTestStatus; testStatus?: CpcTestStatus },
  ) => {
    const { outcome } = data;
    update.mutate(
      { id, data },
      {
        onSuccess: (data) => {
          queryClient.invalidateQueries({ queryKey: ["/api/submissions"] });
          queryClient.invalidateQueries({ queryKey: ["/api/reports/people"] });
          if (outcome === "passed") {
            // A pass may have created a worker and/or linked them to a sheet.
            queryClient.invalidateQueries({ queryKey: ["/api/workers"] });
            queryClient.invalidateQueries({ queryKey: ["/api/grid"] });
            if (data.workerCreated) {
              toast({
                title: `${data.workerName} added as a worker`,
                description: `They are now bookable on ${data.sheetName ?? "the recorded sheet"}.`,
              });
            } else if (data.workerLinkedToSheet) {
              toast({
                title: "Outcome updated",
                description: `${data.workerName} was added to ${data.sheetName ?? "the recorded sheet"}.`,
              });
            } else {
              toast({ title: "Outcome updated" });
            }
          } else {
            toast({ title: "Submission updated" });
          }
        },
        onError: (err) =>
          toast({
            title: "Could not update submission",
            description:
              (err as { response?: { data?: { error?: string } } })?.response?.data?.error,
            variant: "destructive",
          }),
      },
    );
  };

  const handleOutcomeChange = (
    s: {
      id: number;
      workerName: string;
      outcome: SubmissionOutcome;
      cpcStatus: CpcTestStatus;
      testStatus: CpcTestStatus;
    },
    outcome: SubmissionOutcome,
  ) => {
    if (outcome === s.outcome) return;
    // Passing requires both checks passed — mirror the server rule with a
    // clear message instead of a failed request.
    if (
      outcome === "passed" &&
      !(s.cpcStatus === "passed" && s.testStatus === "passed")
    ) {
      toast({
        title: "Cannot mark as Passed yet",
        description:
          "Both the CPC and the driving test must be marked Passed before the outcome can be Passed.",
        variant: "destructive",
      });
      return;
    }
    // Moving AWAY from Passed never deletes the worker — make that explicit
    // before applying, so nobody expects the worker to disappear.
    if (s.outcome === "passed") {
      setUnpassTarget({ id: s.id, workerName: s.workerName, outcome });
      return;
    }
    applyUpdate(s.id, { outcome });
  };

  const handleStatusChange = (
    s: { id: number; cpcStatus: CpcTestStatus; testStatus: CpcTestStatus },
    field: "cpcStatus" | "testStatus",
    value: CpcTestStatus,
  ) => {
    if (s[field] === value) return;
    // Marking a check Failed auto-sets the matching failed outcome
    // server-side; the outcome dropdown stays editable to override it.
    applyUpdate(s.id, { [field]: value });
  };

  const clearDates = () => {
    setFrom("");
    setTo("");
  };

  return (
    <div className="p-6">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle>Submissions</CardTitle>
              <CardDescription>
                Workers put forward to clients and their outcome. Filter by sheet and submitted date.
                Where a submission is linked to a shift requirement, the submitted-vs-needed count is
                shown.
              </CardDescription>
            </div>
            <Button onClick={() => setRecordOpen(true)}>Record submission</Button>
          </div>

          <div className="flex flex-wrap items-end gap-3 pt-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Sheet</label>
              <SearchableSelect
                value={sheetFilter}
                onChange={setSheetFilter}
                placeholder="All sheets"
                searchPlaceholder="Type client or depot…"
                emptyText="No matching sheets."
                ariaLabel="Sheet filter"
                triggerClassName="w-56"
                options={[
                  { value: ALL_SHEETS, label: "All sheets" },
                  ...(sheets ?? []).map((s) => ({
                    value: String(s.id),
                    label: s.name,
                    keywords: [s.clientCompany, s.depot].filter(Boolean).join(" "),
                  })),
                ]}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">From</label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">To</label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
            </div>
            {(from || to) && (
              <Button variant="ghost" size="sm" onClick={clearDates}>
                Clear dates
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="px-2">Worker</TableHead>
                <TableHead className="px-2">Role</TableHead>
                <TableHead className="px-2">Submitted</TableHead>
                <TableHead className="px-2">Sheet</TableHead>
                <TableHead className="px-2">Requirement</TableHead>
                <TableHead className="px-2">
                  Submitted
                  <br />
                  vs needed
                </TableHead>
                <TableHead className="w-[6.5rem] px-2">CPC</TableHead>
                <TableHead className="w-[6.5rem] px-2">Test</TableHead>
                <TableHead className="w-[8.5rem] px-2">Outcome</TableHead>
                {isAdmin && <TableHead className="w-10 px-2 text-right">Delete</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={isAdmin ? 10 : 9} className="py-10 text-center text-muted-foreground">
                    Loading...
                  </TableCell>
                </TableRow>
              ) : !submissions?.length ? (
                <TableRow>
                  <TableCell colSpan={isAdmin ? 10 : 9} className="py-10 text-center text-muted-foreground">
                    No submissions match these filters.
                  </TableCell>
                </TableRow>
              ) : (
                submissions.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="px-2 text-sm font-medium">
                      {s.workerId != null ? (
                        <button
                          type="button"
                          className="rounded text-left hover:underline"
                          onClick={() => setProfileFor(s.workerId!)}
                          title="View or edit worker"
                        >
                          {s.workerName}
                        </button>
                      ) : (
                        <div>
                          <span>{s.workerName}</span>
                          <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                            Candidate
                          </span>
                          {s.candidatePhone && (
                            <div className="text-xs font-normal text-muted-foreground">
                              {s.candidatePhone}
                            </div>
                          )}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="px-2 text-sm text-muted-foreground">
                      {s.jobRole === "Other" && s.customJobTitle
                        ? s.customJobTitle
                        : (s.jobRole ?? "—")}
                    </TableCell>
                    <TableCell className="whitespace-nowrap px-2 text-sm">
                      {format(new Date(s.submittedDate), "d MMM yyyy")}
                    </TableCell>
                    <TableCell className="px-2 text-sm text-muted-foreground">
                      {s.sheetName ?? "—"}
                    </TableCell>
                    <TableCell className="px-2 text-sm text-muted-foreground">
                      {s.requirementId != null ? (
                        <span>
                          {(s.requirementJobRole ?? "Role")}
                          {s.requirementReqDate
                            ? ` · ${format(new Date(s.requirementReqDate), "d MMM")}`
                            : ""}
                        </span>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="px-2 text-sm">
                      {s.requirementId != null && s.requirementQuantityNeeded != null ? (
                        <Badge
                          variant={
                            (s.requirementSubmittedCount ?? 0) >= s.requirementQuantityNeeded
                              ? "default"
                              : "secondary"
                          }
                        >
                          {s.requirementSubmittedCount ?? 0} / {s.requirementQuantityNeeded}
                        </Badge>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="px-2">
                      <Select
                        value={s.cpcStatus}
                        onValueChange={(v) =>
                          handleStatusChange(s, "cpcStatus", v as CpcTestStatus)
                        }
                      >
                        <SelectTrigger className="h-8 w-[6.25rem] px-2 text-xs" aria-label="CPC status">
                          <SelectValue>
                            <span className={CPC_TEST_STATUS_CLASS[s.cpcStatus]}>
                              {CPC_TEST_STATUS_LABELS[s.cpcStatus]}
                            </span>
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {CPC_TEST_STATUSES.map((st) => (
                            <SelectItem key={st} value={st}>
                              {CPC_TEST_STATUS_LABELS[st]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="px-2">
                      <Select
                        value={s.testStatus}
                        onValueChange={(v) =>
                          handleStatusChange(s, "testStatus", v as CpcTestStatus)
                        }
                      >
                        <SelectTrigger className="h-8 w-[6.25rem] px-2 text-xs" aria-label="Driving test status">
                          <SelectValue>
                            <span className={CPC_TEST_STATUS_CLASS[s.testStatus]}>
                              {CPC_TEST_STATUS_LABELS[s.testStatus]}
                            </span>
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {CPC_TEST_STATUSES.map((st) => (
                            <SelectItem key={st} value={st}>
                              {CPC_TEST_STATUS_LABELS[st]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="px-2">
                      <Select
                        value={s.outcome}
                        onValueChange={(v) => handleOutcomeChange(s, v as SubmissionOutcome)}
                      >
                        <SelectTrigger className="h-8 w-[8.25rem] px-2">
                          <SelectValue>
                            <Badge variant={OUTCOME_VARIANT[s.outcome]}>
                              {SUBMISSION_OUTCOME_LABELS[s.outcome]}
                            </Badge>
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {SUBMISSION_OUTCOMES.map((o) => (
                            <SelectItem key={o} value={o}>
                              {SUBMISSION_OUTCOME_LABELS[o]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    {isAdmin && (
                      <TableCell className="px-2 text-right">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          title="Delete submission"
                          aria-label="Delete submission"
                          onClick={() => setDeleteTarget({ id: s.id, workerName: s.workerName })}
                          disabled={deleteSubmission.isPending}
                        >
                          <TrashIcon className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <RecordSubmissionDialog
        open={recordOpen}
        onOpenChange={setRecordOpen}
        defaultSheetId={sheetFilter !== ALL_SHEETS ? Number(sheetFilter) : null}
      />

      {profileFor != null && (
        <WorkerProfileDialog
          open={profileFor != null}
          onOpenChange={(o) => { if (!o) setProfileFor(null); }}
          workerId={profileFor}
          onSaved={() =>
            queryClient.invalidateQueries({ queryKey: getListSubmissionsQueryKey() })
          }
        />
      )}

      <AlertDialog
        open={unpassTarget != null}
        onOpenChange={(o) => !o && setUnpassTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Change outcome from Passed?</AlertDialogTitle>
            <AlertDialogDescription>
              {unpassTarget?.workerName} will stay in the worker list — changing
              the outcome back to{" "}
              {unpassTarget ? SUBMISSION_OUTCOME_LABELS[unpassTarget.outcome] : ""}{" "}
              does not remove them or their bookings. Only this submission's
              outcome changes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (unpassTarget) applyUpdate(unpassTarget.id, { outcome: unpassTarget.outcome });
                setUnpassTarget(null);
              }}
            >
              Change outcome
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ConfirmDeleteDialog
        open={deleteTarget != null}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="Delete this submission?"
        description="This permanently removes the submission record."
        impact={
          <>
            The submission for{" "}
            <span className="font-semibold">{deleteTarget?.workerName}</span> is
            permanently removed and will no longer count in any KPI report
            (submitted / passed / pass-rate). This cannot be undone.
          </>
        }
        confirmLabel="Delete submission"
        pending={deleteSubmission.isPending}
        onConfirm={handleDeleteSubmission}
      />
    </div>
  );
}
