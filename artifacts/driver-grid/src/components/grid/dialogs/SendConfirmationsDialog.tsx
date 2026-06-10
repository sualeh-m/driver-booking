import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { usePreviewConfirmations, useListDrivers } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircleIcon } from "lucide-react";
import { format, startOfWeek, endOfWeek } from "date-fns";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";

export function SendConfirmationsDialog({ open, onOpenChange, contractId }: { open: boolean, onOpenChange: (o: boolean) => void, contractId: number | null }) {
  const [selectedDriverId, setSelectedDriverId] = useState<string>("all");
  
  const start = format(startOfWeek(new Date(), { weekStartsOn: 0 }), "yyyy-MM-dd");
  const end = format(endOfWeek(new Date(), { weekStartsOn: 0 }), "yyyy-MM-dd");

  const previewConfirmations = usePreviewConfirmations();
  const { data: drivers } = useListDrivers();

  const handlePreview = () => {
    previewConfirmations.mutate({ 
      data: { 
        contractId: contractId || undefined, 
        driverId: selectedDriverId !== "all" ? Number(selectedDriverId) : undefined,
        start, 
        end 
      } 
    });
  };

  if (open && !previewConfirmations.isPending && !previewConfirmations.data && !previewConfirmations.isError && previewConfirmations.isIdle) {
    handlePreview();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Send Confirmations</DialogTitle>
          <DialogDescription>
            Preview SMS/WhatsApp confirmations to drivers for the current week.
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
          <Select value={selectedDriverId} onValueChange={(val) => {
            setSelectedDriverId(val);
            // Trigger new preview when selection changes
            previewConfirmations.mutate({ 
              data: { 
                contractId: contractId || undefined, 
                driverId: val !== "all" ? Number(val) : undefined,
                start, 
                end 
              } 
            });
          }}>
            <SelectTrigger className="w-[250px]">
              <SelectValue placeholder="Select Driver" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Drivers (This Contract)</SelectItem>
              {drivers?.map((d) => (
                <SelectItem key={d.id} value={d.id.toString()}>{d.fullName}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="secondary" onClick={handlePreview} disabled={previewConfirmations.isPending}>
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
                      <span>{preview.driverName}</span>
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
