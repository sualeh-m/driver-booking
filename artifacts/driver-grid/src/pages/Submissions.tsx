import { useMemo, useState } from "react";
import {
  useListSubmissions,
  useListSheets,
  useUpdateSubmissionOutcome,
  getListSubmissionsQueryKey,
  type SubmissionOutcome,
  type ListSubmissionsParams,
} from "@workspace/api-client-react";
import { format } from "date-fns";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { RecordSubmissionDialog } from "@/components/grid/dialogs/RecordSubmissionDialog";
import { WorkerProfileDialog } from "@/components/grid/dialogs/WorkerProfileDialog";

export const SUBMISSION_OUTCOMES: SubmissionOutcome[] = ["submitted", "passed", "rejected"];

export const SUBMISSION_OUTCOME_LABELS: Record<SubmissionOutcome, string> = {
  submitted: "Submitted",
  passed: "Passed",
  rejected: "Rejected",
};

const OUTCOME_VARIANT: Record<SubmissionOutcome, "secondary" | "default" | "destructive"> = {
  submitted: "secondary",
  passed: "default",
  rejected: "destructive",
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

  const handleOutcomeChange = (id: number, outcome: SubmissionOutcome) => {
    update.mutate(
      { id, data: { outcome } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["/api/submissions"] });
          toast({ title: "Outcome updated" });
        },
        onError: () => toast({ title: "Could not update outcome", variant: "destructive" }),
      },
    );
  };

  const clearDates = () => {
    setFrom("");
    setTo("");
  };

  return (
    <div className="mx-auto max-w-5xl p-6">
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
              <Select value={sheetFilter} onValueChange={setSheetFilter}>
                <SelectTrigger className="w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_SHEETS}>All sheets</SelectItem>
                  {sheets?.map((s) => (
                    <SelectItem key={s.id} value={String(s.id)}>
                      {s.name} — {s.clientCompany}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
                <TableHead>Worker</TableHead>
                <TableHead>Submitted</TableHead>
                <TableHead>Sheet</TableHead>
                <TableHead>Requirement</TableHead>
                <TableHead>Submitted vs needed</TableHead>
                <TableHead className="w-44">Outcome</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                    Loading...
                  </TableCell>
                </TableRow>
              ) : !submissions?.length ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                    No submissions match these filters.
                  </TableCell>
                </TableRow>
              ) : (
                submissions.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">
                      <button
                        type="button"
                        className="rounded text-left hover:underline"
                        onClick={() => setProfileFor(s.workerId)}
                        title="View or edit worker"
                      >
                        {s.workerName}
                      </button>
                    </TableCell>
                    <TableCell className="text-sm">
                      {format(new Date(s.submittedDate), "d MMM yyyy")}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {s.sheetName ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
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
                    <TableCell className="text-sm">
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
                    <TableCell>
                      <Select
                        value={s.outcome}
                        onValueChange={(v) => handleOutcomeChange(s.id, v as SubmissionOutcome)}
                      >
                        <SelectTrigger className="h-8 w-40">
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
    </div>
  );
}
