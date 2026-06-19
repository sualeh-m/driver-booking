import { useEffect, useState } from "react";
import { format } from "date-fns";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import type { LeaverReason } from "@workspace/api-client-react";
import {
  useMarkWorkerAsLeaver,
  getListLeaversQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { LEAVER_REASON_LABELS } from "@/pages/Leavers";

const REASONS: LeaverReason[] = [
  "low_rates",
  "travel_distance",
  "permanent_employment",
  "shift_pattern",
  "performance_issues",
  "attendance_issues",
  "other",
];

const CONFIRM_WORD = "DELETE";

export function MarkLeaverDialog({
  open,
  onOpenChange,
  workerId,
  workerName,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  workerId: number;
  workerName: string;
  /** Called after a successful mark-as-leaver so the caller can refresh lists. */
  onSaved?: () => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Two-step double confirmation:
  //   "confirm" — explain the action + require typing DELETE exactly
  //   "details" — record leave date, reason and optional notes
  const [step, setStep] = useState<"confirm" | "details">("confirm");
  const [confirmText, setConfirmText] = useState("");
  const [leaveDate, setLeaveDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [reason, setReason] = useState<LeaverReason>("low_rates");
  const [notes, setNotes] = useState("");

  // Reset the whole flow every time the dialog opens so a previous attempt
  // never leaks its typed confirmation or step into a new one.
  useEffect(() => {
    if (open) {
      setStep("confirm");
      setConfirmText("");
      setLeaveDate(format(new Date(), "yyyy-MM-dd"));
      setReason("low_rates");
      setNotes("");
    }
  }, [open]);

  const markLeaver = useMarkWorkerAsLeaver();

  // Exact match — no trimming, so "DELETE " or " DELETE" do NOT count.
  const confirmed = confirmText === CONFIRM_WORD;

  const handleConfirm = () => {
    if (!confirmed) return;
    if (!leaveDate) {
      toast({ title: "Pick a leave date", variant: "destructive" });
      return;
    }
    markLeaver.mutate(
      { id: workerId, data: { leaveDate, reason, notes: notes.trim() || undefined } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListLeaversQueryKey() });
          queryClient.invalidateQueries({ queryKey: ["/api/grid"] });
          onSaved?.();
          toast({
            title: `${workerName} marked as a leaver`,
            description: "Removed from the booking grid. You can restore them from the Leavers view.",
          });
          onOpenChange(false);
        },
        onError: (err: unknown) => {
          const body = (err as { data?: { error?: string } } | undefined)?.data;
          toast({
            title: "Could not mark as leaver",
            description: body?.error ?? "Please try again.",
            variant: "destructive",
          });
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {step === "confirm" ? (
          <>
            <DialogHeader>
              <DialogTitle className="text-destructive">
                Mark as leaver — {workerName}
              </DialogTitle>
              <DialogDescription>
                This is a serious action. {workerName} will be marked as having left
                and removed from the bookable grid. They will move to the Leavers
                view (and can still be restored from there).
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 pt-1">
              <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                To continue, type <span className="font-semibold">{CONFIRM_WORD}</span>{" "}
                in the box below.
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">
                  Type {CONFIRM_WORD} to confirm
                </label>
                <Input
                  autoFocus
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder={CONFIRM_WORD}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && confirmed) setStep("details");
                  }}
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                disabled={!confirmed}
                onClick={() => setStep("details")}
              >
                Continue
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Leaver details — {workerName}</DialogTitle>
              <DialogDescription>
                Record when and why this worker left. This is reversible.
              </DialogDescription>
            </DialogHeader>

            <div className="grid grid-cols-2 gap-3 pt-1">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Leave date</label>
                <Input type="date" value={leaveDate} onChange={(e) => setLeaveDate(e.target.value)} />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Reason</label>
                <Select value={reason} onValueChange={(v) => setReason(v as LeaverReason)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {REASONS.map((r) => (
                      <SelectItem key={r} value={r}>
                        {LEAVER_REASON_LABELS[r]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Notes (optional)</label>
              <Textarea
                placeholder="e.g. Took a permanent role elsewhere."
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>

            <DialogFooter className="sm:justify-between">
              <Button
                variant="outline"
                onClick={() => setStep("confirm")}
                disabled={markLeaver.isPending}
              >
                Back
              </Button>
              <Button
                variant="destructive"
                onClick={handleConfirm}
                disabled={markLeaver.isPending || !confirmed}
              >
                {markLeaver.isPending ? "Saving..." : "Mark as leaver"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
