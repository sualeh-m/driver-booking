import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { usePreviewConfirmations } from "@workspace/api-client-react";
import type { GridWorker } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircleIcon } from "lucide-react";
import { format, startOfWeek, endOfWeek } from "date-fns";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";

export function SendConfirmationsDialog({ open, onOpenChange, sheetId, workers }: { open: boolean, onOpenChange: (o: boolean) => void, sheetId: number | null, workers?: GridWorker[] }) {
  const [selectedWorkerId, setSelectedWorkerId] = useState<string>("all");

  const start = format(startOfWeek(new Date(), { weekStartsOn: 0 }), "yyyy-MM-dd");
  const end = format(endOfWeek(new Date(), { weekStartsOn: 0 }), "yyyy-MM-dd");

  const previewConfirmations = usePreviewConfirmations();
  const { reset, mutate } = previewConfirmations;

  const runPreview = (workerSel: string) => {
    mutate({
      data: {
        sheetId: sheetId || undefined,
        workerId: workerSel !== "all" ? Number(workerSel) : undefined,
        start,
        end,
      },
    });
  };

  // Fetch fresh on open / sheet change; reset selection + clear stale data on
  // close so a previously selected sheet's previews can't leak into a new one.
  useEffect(() => {
    if (open && sheetId !== null) {
      setSelectedWorkerId("all");
      reset();
      runPreview("all");
    } else if (!open) {
      reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, sheetId, start, end]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Send Confirmations</DialogTitle>
          <DialogDescription>
            Preview SMS/WhatsApp confirmations to workers for the current week.
          </DialogDescription>
        </DialogHeader>

        <Alert variant="default" className="bg-primary/5 border-primary/20 text-primary">
          <AlertCircleIcon className="h-4 w-4" />
          <AlertTitle>Phase 2 Feature</AlertTitle>
          <AlertDescription>
            Actual message sending is deferred to Phase 2. This is a preview of the messages that will be sent.
          </AlertDescription>
        </Alert>

        <div className="flex items-center gap-4 py-2">
          <SearchableSelect
            value={selectedWorkerId}
            onChange={(val) => {
              setSelectedWorkerId(val);
              runPreview(val);
            }}
            placeholder="Select Worker"
            searchPlaceholder="Type a name…"
            emptyText="No matching workers."
            ariaLabel="Worker"
            triggerClassName="w-[250px]"
            options={[
              { value: "all", label: "All Workers (This Sheet)" },
              ...(workers ?? []).map((w) => ({
                value: w.id.toString(),
                label: w.fullName,
                description: w.phone ?? undefined,
              })),
            ]}
          />
          <Button variant="secondary" onClick={() => runPreview(selectedWorkerId)} disabled={previewConfirmations.isPending}>
            Refresh Preview
          </Button>
        </div>

        <ScrollArea className="flex-1 rounded-md border p-4 bg-muted/10">
          {previewConfirmations.isPending ? (
            <div className="text-center text-muted-foreground p-8">Generating previews...</div>
          ) : previewConfirmations.isError ? (
            <div className="text-center text-destructive p-8">Failed to generate previews.</div>
          ) : previewConfirmations.data?.length === 0 ? (
            <div className="text-center text-muted-foreground p-8">No shifts found to confirm for this selection.</div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {previewConfirmations.data?.map((preview, i) => (
                <Card key={i} className="shadow-sm">
                  <CardHeader className="pb-2 bg-muted/30">
                    <CardTitle className="text-sm flex justify-between">
                      <span>{preview.workerName}</span>
                      <span className="text-muted-foreground font-normal">{preview.phone || "No phone"}</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-4">
                    <div className="text-sm whitespace-pre-wrap bg-primary/5 p-3 rounded-md border border-primary/10">
                      {preview.messageText}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </ScrollArea>

        <div className="flex justify-end gap-2 pt-4 border-t mt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          <Button disabled>Send Messages</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
