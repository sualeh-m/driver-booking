import { useState } from "react";
import { format } from "date-fns";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import type { Event, EventType, WorkerType } from "@workspace/api-client-react";
import {
  useCreateEvent,
  useListWorkerEvents,
  useDeleteEvent,
  getListWorkerEventsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

const EVENT_LABELS: Record<EventType, string> = {
  no_show: "No Show",
  cpc_failure: "CPC Failure",
  test_failure: "Test Failure",
};

// CPC and test failures are HGV-only (also enforced server-side); Warehouse
// workers can only ever have a No Show.
function typesForWorker(workerType: WorkerType): EventType[] {
  return workerType === "HGV"
    ? ["no_show", "cpc_failure", "test_failure"]
    : ["no_show"];
}

export function EventsDialog({
  open,
  onOpenChange,
  workerId,
  workerName,
  workerType,
  sheetId,
  onMarkLeaver,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  workerId: number;
  workerName: string;
  workerType: WorkerType;
  sheetId: number;
  onMarkLeaver: (workerId: number, workerName: string) => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const allowedTypes = typesForWorker(workerType);
  const [eventType, setEventType] = useState<EventType>(allowedTypes[0]);
  const [eventDate, setEventDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [notes, setNotes] = useState("");

  const eventsQuery = useListWorkerEvents(workerId, {
    query: { enabled: open, queryKey: getListWorkerEventsQueryKey(workerId) },
  });
  const createEvent = useCreateEvent();
  const deleteEvent = useDeleteEvent();

  const refetchEvents = () =>
    queryClient.invalidateQueries({ queryKey: getListWorkerEventsQueryKey(workerId) });

  // No-shows can auto-flag a worker as Do Not Book (5th no-show), which removes
  // them from the grid — refresh it. Prefix match covers every sheet/range key.
  const refetchGrid = () =>
    queryClient.invalidateQueries({ queryKey: ["/api/grid"] });

  const handleLog = () => {
    if (!eventDate) {
      toast({ title: "Pick a date for the event", variant: "destructive" });
      return;
    }
    createEvent.mutate(
      {
        data: {
          workerId,
          sheetId,
          eventType,
          eventDate,
          notes: notes.trim() || undefined,
        },
      },
      {
        onSuccess: (event) => {
          refetchEvents();
          refetchGrid();
          setNotes("");
          if (event.autoFlagged) {
            toast({
              title: `${workerName} flagged Do Not Book`,
              description: "Reached 5 no-shows — removed from the scheduler. You can allow booking again from the Do Not Book view.",
            });
          } else {
            toast({ title: `${EVENT_LABELS[eventType]} logged for ${workerName}` });
          }
        },
        onError: (err: unknown) => {
          const body = (err as { data?: { error?: string } } | undefined)?.data;
          toast({
            title: "Could not log event",
            description: body?.error ?? "Please try again.",
            variant: "destructive",
          });
        },
      }
    );
  };

  const handleDelete = (id: number) => {
    deleteEvent.mutate(
      { id },
      {
        onSuccess: () => {
          refetchEvents();
          toast({ title: "Event deleted" });
        },
        onError: () => toast({ title: "Failed to delete event", variant: "destructive" }),
      }
    );
  };

  const events: Event[] = eventsQuery.data ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Events — {workerName}</DialogTitle>
          <DialogDescription>
            Log an event against this {workerType} worker, or review past events.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3 pt-1">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Type</label>
            <Select value={eventType} onValueChange={(v) => setEventType(v as EventType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {allowedTypes.map((t) => (
                  <SelectItem key={t} value={t}>
                    {EVENT_LABELS[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Date</label>
            <Input type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} />
          </div>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Notes (optional)</label>
          <Textarea
            placeholder="e.g. Did not turn up for 06:00 start."
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            className="text-destructive hover:text-destructive"
            onClick={() => onMarkLeaver(workerId, workerName)}
          >
            Mark as leaver
          </Button>
          <Button onClick={handleLog} disabled={createEvent.isPending}>
            {createEvent.isPending ? "Logging..." : "Log Event"}
          </Button>
        </div>

        <div className="border-t pt-3">
          <div className="mb-2 text-sm font-medium">Logged events</div>
          {eventsQuery.isLoading ? (
            <div className="text-sm text-muted-foreground">Loading...</div>
          ) : events.length === 0 ? (
            <div className="text-sm text-muted-foreground">No events logged for this worker.</div>
          ) : (
            <ul className="max-h-56 space-y-2 overflow-auto">
              {events.map((ev) => (
                <li
                  key={ev.id}
                  className="flex items-start justify-between gap-2 rounded-md border p-2 text-sm"
                >
                  <div>
                    <div className="font-medium">{EVENT_LABELS[ev.eventType]}</div>
                    <div className="text-xs text-muted-foreground">
                      {format(new Date(ev.eventDate), "EEE d MMM yyyy")}
                    </div>
                    {ev.notes && <div className="mt-1 text-xs">{ev.notes}</div>}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={() => handleDelete(ev.id)}
                    disabled={deleteEvent.isPending}
                    aria-label="Delete event"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
