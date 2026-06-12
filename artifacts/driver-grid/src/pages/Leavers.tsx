import { useState } from "react";
import {
  useListLeavers,
  useRestoreWorker,
  getListLeaversQueryKey,
  type LeaverReason,
} from "@workspace/api-client-react";
import { format } from "date-fns";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { WorkerProfileDialog } from "@/components/grid/dialogs/WorkerProfileDialog";

export const LEAVER_REASON_LABELS: Record<LeaverReason, string> = {
  low_rates: "Low Rates",
  travel_distance: "Travel Distance",
  permanent_employment: "Permanent Employment",
  shift_pattern: "Shift Pattern",
  performance_issues: "Performance Issues",
  attendance_issues: "Attendance Issues",
  other: "Other",
};

// Turn a whole-day count into a friendly length-of-service string. null means
// the worker never had a booking, so service never started.
function formatService(serviceDays: number | null): string {
  if (serviceDays == null) return "Not started";
  if (serviceDays < 1) return "Less than a day";
  if (serviceDays < 31) return `${serviceDays} day${serviceDays === 1 ? "" : "s"}`;
  const months = Math.floor(serviceDays / 30);
  if (months < 12) return `${months} month${months === 1 ? "" : "s"}`;
  const years = Math.floor(months / 12);
  const remMonths = months % 12;
  return remMonths > 0
    ? `${years} yr ${remMonths} mo`
    : `${years} year${years === 1 ? "" : "s"}`;
}

export function Leavers() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: leavers, isLoading } = useListLeavers({
    query: { queryKey: getListLeaversQueryKey() },
  });
  const restore = useRestoreWorker();
  const [profileFor, setProfileFor] = useState<number | null>(null);

  const handleRestore = (id: number, fullName: string) => {
    restore.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListLeaversQueryKey() });
          queryClient.invalidateQueries({ queryKey: ["/api/grid"] });
          toast({ title: `${fullName} restored to active` });
        },
        onError: () => toast({ title: "Could not restore worker", variant: "destructive" }),
      }
    );
  };

  return (
    <div className="mx-auto max-w-4xl p-6">
      <Card>
        <CardHeader>
          <CardTitle>Leavers</CardTitle>
          <CardDescription>
            Workers who have left. They are removed from the booking grid. If someone was marked as a
            leaver by mistake, restore them to bring them back to active and bookable.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Worker</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Leave date</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Length of service</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                    Loading...
                  </TableCell>
                </TableRow>
              ) : !leavers?.length ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                    No leavers.
                  </TableCell>
                </TableRow>
              ) : (
                leavers.map((l) => (
                  <TableRow key={l.workerId}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          className="rounded text-left hover:underline"
                          onClick={() => setProfileFor(l.workerId)}
                          title="View or edit worker"
                        >
                          {l.fullName}
                        </button>
                        <Badge variant="secondary">Left</Badge>
                      </div>
                      {l.jobRole && (
                        <div className="text-xs text-muted-foreground">{l.jobRole}</div>
                      )}
                      {l.notes && (
                        <div className="mt-1 text-xs text-muted-foreground">{l.notes}</div>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{l.workerType}</TableCell>
                    <TableCell className="text-sm">
                      {format(new Date(l.leaveDate), "d MMM yyyy")}
                    </TableCell>
                    <TableCell className="text-sm">{LEAVER_REASON_LABELS[l.reason]}</TableCell>
                    <TableCell className="text-sm">{formatService(l.serviceDays)}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleRestore(l.workerId, l.fullName)}
                        disabled={restore.isPending}
                      >
                        Restore
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {profileFor != null && (
        <WorkerProfileDialog
          open={profileFor != null}
          onOpenChange={(o) => { if (!o) setProfileFor(null); }}
          workerId={profileFor}
          onSaved={() =>
            queryClient.invalidateQueries({ queryKey: getListLeaversQueryKey() })
          }
        />
      )}
    </div>
  );
}
