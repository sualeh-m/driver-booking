import { useState } from "react";
import {
  useListDoNotBookWorkers,
  useSetWorkerDoNotBook,
  getListDoNotBookWorkersQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { WorkerProfileDialog } from "@/components/grid/dialogs/WorkerProfileDialog";

export function DoNotBook() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: workers, isLoading } = useListDoNotBookWorkers({
    query: { queryKey: getListDoNotBookWorkersQueryKey() },
  });
  const setDoNotBook = useSetWorkerDoNotBook();
  const [profileFor, setProfileFor] = useState<number | null>(null);

  const handleAllowAgain = (id: number, fullName: string) => {
    setDoNotBook.mutate(
      { id, data: { doNotBook: false } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListDoNotBookWorkersQueryKey() });
          queryClient.invalidateQueries({ queryKey: ["/api/grid"] });
          toast({ title: `${fullName} can be booked again` });
        },
        onError: () => toast({ title: "Could not update worker", variant: "destructive" }),
      }
    );
  };

  return (
    <div className="mx-auto max-w-4xl p-6">
      <Card>
        <CardHeader>
          <CardTitle>Do Not Book</CardTitle>
          <CardDescription>
            Workers flagged as Do Not Book are hidden from the booking grid. Flagging is reversible —
            allow a worker again to bring them back. Workers are auto-flagged after 5 logged no-shows.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Worker</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-center">No-shows</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-10 text-center text-muted-foreground">
                    Loading...
                  </TableCell>
                </TableRow>
              ) : !workers?.length ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-10 text-center text-muted-foreground">
                    No workers are flagged Do Not Book.
                  </TableCell>
                </TableRow>
              ) : (
                workers.map((w) => (
                  <TableRow key={w.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          className="rounded text-left hover:underline"
                          onClick={() => setProfileFor(w.id)}
                          title="View or edit worker"
                        >
                          {w.fullName}
                        </button>
                        <Badge variant="destructive">Do Not Book</Badge>
                      </div>
                      {w.jobRole && (
                        <div className="text-xs text-muted-foreground">{w.jobRole}</div>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{w.workerType}</TableCell>
                    <TableCell className="text-center">{w.noShowCount}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleAllowAgain(w.id, w.fullName)}
                        disabled={setDoNotBook.isPending}
                      >
                        Allow booking again
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
            queryClient.invalidateQueries({ queryKey: getListDoNotBookWorkersQueryKey() })
          }
        />
      )}
    </div>
  );
}
