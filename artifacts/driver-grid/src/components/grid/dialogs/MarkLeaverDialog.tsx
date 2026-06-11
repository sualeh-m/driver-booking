import { useState } from "react";
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

export function MarkLeaverDialog({
  open,
  onOpenChange,
  workerId,
  workerName,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  workerId: number;
  workerName: string;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [leaveDate, setLeaveDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [reason, setReason] = useState<LeaverReason>("low_rates");
  const [notes, setNotes] = useState("");

  const markLeaver = useMarkWorkerAsLeaver();

  const handleConfirm = () => {
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
          toast({
            title: `${workerName} marked as a leaver`,
            description: "Removed from the booking grid. You can restore them from the Leavers view.",
          });
          onOpenChange(false);
        },
        onError: () => toast({ title: "Could not mark as leaver", variant: "destructive" }),
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mark as leaver — {workerName}</DialogTitle>
          <DialogDescription>
            Record that this worker has left. They will be removed from the booking grid and shown in
            the Leavers view. This is reversible.
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

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={markLeaver.isPending}>
            {markLeaver.isPending ? "Saving..." : "Mark as leaver"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
