import { useMemo, useState } from "react";
import { format } from "date-fns";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { SubmissionOutcome } from "@workspace/api-client-react";
import {
  useListWorkers,
  useListSheets,
  useListRequirements,
  useCreateSubmission,
  getListRequirementsQueryKey,
  getListSubmissionsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { SUBMISSION_OUTCOME_LABELS, SUBMISSION_OUTCOMES } from "@/pages/Submissions";

const NONE = "__none__";

export function RecordSubmissionDialog({
  open,
  onOpenChange,
  defaultSheetId,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  defaultSheetId: number | null;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: workers } = useListWorkers();
  const { data: sheets } = useListSheets();

  const [workerId, setWorkerId] = useState<string>("");
  const [submittedDate, setSubmittedDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [outcome, setOutcome] = useState<SubmissionOutcome>("submitted");
  const [sheetId, setSheetId] = useState<string>(defaultSheetId ? String(defaultSheetId) : NONE);
  const [requirementId, setRequirementId] = useState<string>(NONE);

  // Requirements are scoped to the chosen sheet; only fetch when one is selected.
  const reqSheetId = sheetId !== NONE ? Number(sheetId) : undefined;
  const { data: requirements } = useListRequirements(
    reqSheetId ? { sheetId: reqSheetId } : undefined,
    {
      query: {
        enabled: reqSheetId != null,
        queryKey: getListRequirementsQueryKey(reqSheetId ? { sheetId: reqSheetId } : undefined),
      },
    },
  );

  const activeWorkers = useMemo(
    () => (workers ?? []).filter((w) => w.status === "active"),
    [workers],
  );

  const create = useCreateSubmission();

  const handleConfirm = () => {
    if (!workerId) {
      toast({ title: "Pick a worker", variant: "destructive" });
      return;
    }
    if (!submittedDate) {
      toast({ title: "Pick a submitted date", variant: "destructive" });
      return;
    }
    create.mutate(
      {
        data: {
          workerId: Number(workerId),
          submittedDate,
          outcome,
          sheetId: sheetId !== NONE ? Number(sheetId) : undefined,
          requirementId: requirementId !== NONE ? Number(requirementId) : undefined,
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["/api/submissions"] });
          toast({ title: "Submission recorded" });
          onOpenChange(false);
          setWorkerId("");
          setRequirementId(NONE);
          setOutcome("submitted");
        },
        onError: () => toast({ title: "Could not record submission", variant: "destructive" }),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record submission</DialogTitle>
          <DialogDescription>
            Record a worker being put forward to a client. Optionally link it to a specific shift
            requirement and/or sheet, and set the starting outcome.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3 pt-1">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Worker</label>
            <Select value={workerId} onValueChange={setWorkerId}>
              <SelectTrigger>
                <SelectValue placeholder="Select worker" />
              </SelectTrigger>
              <SelectContent>
                {activeWorkers.map((w) => (
                  <SelectItem key={w.id} value={String(w.id)}>
                    {w.fullName} · {w.workerType}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Date submitted</label>
            <Input type="date" value={submittedDate} onChange={(e) => setSubmittedDate(e.target.value)} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Sheet (optional)</label>
            <Select
              value={sheetId}
              onValueChange={(v) => {
                setSheetId(v);
                setRequirementId(NONE);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="No sheet" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>No sheet</SelectItem>
                {sheets?.map((s) => (
                  <SelectItem key={s.id} value={String(s.id)}>
                    {s.name} — {s.clientCompany}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Requirement (optional)</label>
            <Select
              value={requirementId}
              onValueChange={setRequirementId}
              disabled={reqSheetId == null}
            >
              <SelectTrigger>
                <SelectValue placeholder={reqSheetId == null ? "Pick a sheet first" : "No requirement"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>No requirement</SelectItem>
                {requirements?.map((r) => (
                  <SelectItem key={r.id} value={String(r.id)}>
                    {(r.jobRole ?? "Role")} · {format(new Date(r.reqDate), "d MMM")} · needs {r.quantityNeeded}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Outcome</label>
          <Select value={outcome} onValueChange={(v) => setOutcome(v as SubmissionOutcome)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SUBMISSION_OUTCOMES.map((o) => (
                <SelectItem key={o} value={o}>
                  {SUBMISSION_OUTCOME_LABELS[o]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={create.isPending}>
            {create.isPending ? "Saving..." : "Record submission"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
