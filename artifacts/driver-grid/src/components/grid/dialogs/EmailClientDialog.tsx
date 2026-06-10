import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { usePreviewClientEmail } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircleIcon, CalendarIcon } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format, startOfWeek, endOfWeek } from "date-fns";

export function EmailClientDialog({ open, onOpenChange, contractId }: { open: boolean, onOpenChange: (o: boolean) => void, contractId: number | null }) {
  const start = format(startOfWeek(new Date(), { weekStartsOn: 0 }), "yyyy-MM-dd");
  const end = format(endOfWeek(new Date(), { weekStartsOn: 0 }), "yyyy-MM-dd");

  const previewEmail = usePreviewClientEmail();

  const handlePreview = () => {
    if (!contractId) return;
    previewEmail.mutate({ data: { contractId, start, end } });
  };

  // Auto-fetch when opened if we don't have data
  if (open && contractId && !previewEmail.isPending && !previewEmail.data && !previewEmail.isError && previewEmail.isIdle) {
    handlePreview();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Email Client</DialogTitle>
          <DialogDescription>
            Preview the weekly roster email for this client.
          </DialogDescription>
        </DialogHeader>

        <Alert variant="default" className="bg-primary/5 border-primary/20 text-primary">
          <AlertCircleIcon className="h-4 w-4" />
          <AlertTitle>Phase 2 Feature</AlertTitle>
          <AlertDescription>
            Actual email sending is deferred to Phase 2. This is a preview of the message that will be sent.
          </AlertDescription>
        </Alert>

        <div className="flex-1 overflow-auto py-2">
          {!contractId ? (
            <div className="text-center text-muted-foreground p-8">No contract selected</div>
          ) : previewEmail.isPending ? (
            <div className="text-center text-muted-foreground p-8">Generating preview...</div>
          ) : previewEmail.isError ? (
            <div className="text-center text-destructive p-8">Failed to generate preview. Make sure the contract has a contact email.</div>
          ) : previewEmail.data ? (
            <div className="space-y-4">
              <div className="rounded-md border p-4 bg-muted/20 space-y-2">
                <div className="grid grid-cols-[80px_1fr] gap-2 text-sm">
                  <span className="text-muted-foreground font-medium">To:</span>
                  <span>{previewEmail.data.recipientName} &lt;{previewEmail.data.recipientEmail}&gt;</span>
                  
                  <span className="text-muted-foreground font-medium">Subject:</span>
                  <span className="font-semibold">{previewEmail.data.subject}</span>
                </div>
              </div>

              <div className="rounded-md border p-4 text-sm whitespace-pre-wrap">
                {previewEmail.data.body}
              </div>

              {previewEmail.data.rows.length > 0 ? (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Driver</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Start Time</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {previewEmail.data.rows.map((row, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-medium">{row.driverName}</TableCell>
                          <TableCell>{row.jobRole || "-"}</TableCell>
                          <TableCell>{format(new Date(row.shiftDate), "MMM d, yyyy")}</TableCell>
                          <TableCell>{row.status}</TableCell>
                          <TableCell>{row.startTime || "-"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="text-center text-muted-foreground p-4 border rounded-md">
                  No shifts scheduled for this week.
                </div>
              )}
            </div>
          ) : null}
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          <Button disabled>Send Email</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
