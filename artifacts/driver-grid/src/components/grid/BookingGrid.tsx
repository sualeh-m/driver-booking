import { useState } from "react";
import { format, eachDayOfInterval } from "date-fns";
import { GridResponse, Booking, Status, BookingInput } from "@workspace/api-client-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useUpsertBooking, useDeleteBooking, getGetGridQueryKey, getGetDashboardSummaryQueryKey, getListAuditQueryKey } from "@workspace/api-client-react";
import type { WorkerType } from "@workspace/api-client-react";
import { AlertTriangle } from "lucide-react";
import { EventsDialog } from "./dialogs/EventsDialog";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface BookingGridProps {
  sheetId: number;
  start: Date;
  end: Date;
  data?: GridResponse;
  isLoading: boolean;
}

export function BookingGrid({ sheetId, start, end, data, isLoading }: BookingGridProps) {
  const queryClient = useQueryClient();
  const upsertBooking = useUpsertBooking();
  const deleteBooking = useDeleteBooking();
  const { toast } = useToast();
  const days = eachDayOfInterval({ start, end });
  const [restWarning, setRestWarning] = useState<{ input: BookingInput; message: string } | null>(null);
  const [eventsFor, setEventsFor] = useState<{ id: number; fullName: string; workerType: WorkerType } | null>(null);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getGetGridQueryKey({ sheetId, start: format(start, "yyyy-MM-dd"), end: format(end, "yyyy-MM-dd") }) });
    queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListAuditQueryKey({}) });
  };

  // Lookup of consecutive-working-day counters keyed "workerId|date" (HGV only).
  const restCounters = new Map<string, number>();
  for (const c of data?.restCounters ?? []) {
    restCounters.set(`${c.workerId}|${c.shiftDate}`, c.days);
  }

  const saveBooking = (input: BookingInput) => {
    upsertBooking.mutate(
      { data: input },
      {
        onSuccess: () => {
          invalidate();
          setRestWarning(null);
        },
        onError: (err: unknown) => {
          const body = (err as { data?: { code?: string; error?: string } } | undefined)?.data;
          const message = body?.error ?? (err instanceof Error ? err.message : "Failed to save booking");
          if (body?.code === "REST_WARNING") {
            setRestWarning({ input, message });
          } else if (body?.code === "REST_BLOCK") {
            setRestWarning(null);
            toast({ title: "Booking blocked", description: message, variant: "destructive" });
          } else {
            toast({ title: "Failed to save booking", description: message, variant: "destructive" });
          }
        },
      }
    );
  };

  const handleCellSave = (workerId: number, dateStr: string, status: Status, startTime: string) => {
    saveBooking({ sheetId, workerId, shiftDate: dateStr, status, startTime: startTime || null });
  };

  const handleCellDelete = (id: number) => {
    deleteBooking.mutate({ id }, { onSuccess: invalidate });
  };

  if (isLoading) {
    return <div className="p-8 text-center text-muted-foreground">Loading grid...</div>;
  }

  if (!data?.workers.length) {
    return <div className="p-8 text-center text-muted-foreground">No workers linked to this sheet. Use "Add Worker" to get started.</div>;
  }

  // Count working shifts per day (a working shift = a booking with a start time)
  const shiftsPerDay = days.map(day => {
    const dateStr = format(day, "yyyy-MM-dd");
    return data.bookings.filter(b => b.shiftDate === dateStr && b.startTime).length;
  });

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-auto">
        <Table className="border-collapse">
          <TableHeader className="sticky top-0 z-10 bg-muted/80 backdrop-blur">
            <TableRow>
              <TableHead className="w-[180px] border-r">Worker</TableHead>
              <TableHead className="w-[120px] border-r">Phone</TableHead>
              <TableHead className="w-[220px] border-r">Standing Note</TableHead>
              {days.map((day) => (
                <TableHead key={day.toISOString()} className="min-w-[100px] border-r text-center">
                  <div className="font-semibold">{format(day, "EEE")}</div>
                  <div className="text-xs text-muted-foreground">{format(day, "MMM d")}</div>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.workers.map((worker) => (
              <TableRow key={worker.id}>
                <TableCell className="border-r font-medium sticky left-0 bg-background">
                  <div className="flex items-start justify-between gap-1">
                    <div>
                      <div>{worker.fullName}</div>
                      {worker.jobRole && <div className="text-xs text-muted-foreground">{worker.jobRole}</div>}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 shrink-0 text-muted-foreground hover:text-foreground"
                      onClick={() => setEventsFor({ id: worker.id, fullName: worker.fullName, workerType: worker.workerType })}
                      aria-label={`Log or view events for ${worker.fullName}`}
                      title="Events"
                    >
                      <AlertTriangle className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
                <TableCell className="border-r text-xs text-muted-foreground">{worker.phone || "-"}</TableCell>
                <TableCell className="border-r text-xs text-muted-foreground">{worker.note || "-"}</TableCell>
                {days.map((day) => {
                  const dateStr = format(day, "yyyy-MM-dd");
                  const booking = data.bookings.find(
                    (b) => b.workerId === worker.id && b.shiftDate === dateStr
                  );
                  return (
                    <BookingCell
                      key={`${worker.id}-${dateStr}`}
                      booking={booking}
                      dateStr={dateStr}
                      workerId={worker.id}
                      workerName={worker.fullName}
                      restDays={restCounters.get(`${worker.id}|${dateStr}`)}
                      onSave={handleCellSave}
                      onDelete={handleCellDelete}
                    />
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
          <TableHeader>
            <TableRow>
              <TableHead colSpan={3} className="border-r text-right font-semibold sticky left-0 bg-muted">
                Total Working Shifts
              </TableHead>
              {shiftsPerDay.map((count, i) => (
                <TableHead key={i} className="border-r text-center font-bold text-primary">
                  {count}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
        </Table>
      </div>

      <div className="border-t bg-card p-2 flex flex-wrap items-center justify-end gap-4 text-xs">
        <div className="flex items-center gap-1"><div className="h-3 w-3 rounded-sm status-available" /> Available</div>
        <div className="flex items-center gap-1"><div className="h-3 w-3 rounded-sm status-pre-booked" /> Pre-Booked</div>
        <div className="flex items-center gap-1"><div className="h-3 w-3 rounded-sm status-confirmed" /> Confirmed</div>
        <div className="flex items-center gap-1"><div className="h-3 w-3 rounded-sm status-rest" /> Rest</div>
        <div className="flex items-center gap-1"><div className="h-3 w-3 rounded-sm border status-off" /> Off</div>
        <div className="flex items-center gap-1"><div className="h-3 w-3 rounded-sm status-holiday flex items-center justify-center text-[8px] text-white leading-none">✕</div> Holiday</div>
        <div className="flex items-center gap-1"><span className="flex h-4 min-w-4 items-center justify-center rounded-full border border-slate-300 bg-white px-1 text-[9px] font-bold text-slate-900 leading-none">3</span> HGV consecutive working days</div>
      </div>

      <AlertDialog open={!!restWarning} onOpenChange={(o) => { if (!o) setRestWarning(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rest-day warning</AlertDialogTitle>
            <AlertDialogDescription>{restWarning?.message}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (restWarning) saveBooking({ ...restWarning.input, acknowledgeRestWarning: true }); }}>
              Book anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {eventsFor && (
        <EventsDialog
          open={!!eventsFor}
          onOpenChange={(o) => { if (!o) setEventsFor(null); }}
          workerId={eventsFor.id}
          workerName={eventsFor.fullName}
          workerType={eventsFor.workerType}
          sheetId={sheetId}
        />
      )}
    </div>
  );
}

function BookingCell({ booking, dateStr, workerId, workerName, restDays, onSave, onDelete }: { booking?: Booking, dateStr: string, workerId: number, workerName: string, restDays?: number, onSave: (workerId: number, dateStr: string, status: Status, startTime: string) => void, onDelete: (id: number) => void }) {
  const [open, setOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [status, setStatus] = useState<Status>(booking?.status || "Off");
  const [time, setTime] = useState(booking?.startTime || "");

  const handleSave = () => {
    onSave(workerId, dateStr, status, time);
    setOpen(false);
  };

  const handleDelete = () => {
    if (booking) onDelete(booking.id);
    setConfirmDelete(false);
    setOpen(false);
  };

  const getStatusClass = (s?: Status) => {
    switch (s) {
      case "Available": return "status-available";
      case "Pre-Booked": return "status-pre-booked";
      case "Confirmed": return "status-confirmed";
      case "Rest": return "status-rest";
      case "Off": return "status-off";
      case "Holiday": return "status-holiday";
      default: return "";
    }
  };

  const isWorkingStatus = ["Available", "Pre-Booked", "Confirmed"].includes(status);

  const renderContent = () => {
    if (!booking) return "";
    if (booking.status === "Holiday") return "✕";
    if (booking.startTime) return booking.startTime;
    return booking.status;
  };

  return (
    <TableCell className="border-r p-0 align-top">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <div
            className={`relative h-full w-full min-h-[48px] cursor-pointer p-2 flex items-center justify-center text-xs font-medium hover:ring-2 hover:ring-inset hover:ring-primary/50 transition-all ${getStatusClass(booking?.status)}`}
          >
            {restDays != null && restDays > 0 && (
              <span
                title={`${restDays} consecutive working day${restDays === 1 ? "" : "s"} since last rest`}
                className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full border border-slate-300 bg-white px-1 text-[9px] font-bold leading-none text-slate-900"
              >
                {restDays}
              </span>
            )}
            {renderContent()}
          </div>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-3" side="bottom" align="start">
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as Status)}>
                <SelectTrigger className="h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Off">Off</SelectItem>
                  <SelectItem value="Available">Available</SelectItem>
                  <SelectItem value="Pre-Booked">Pre-Booked</SelectItem>
                  <SelectItem value="Confirmed">Confirmed</SelectItem>
                  <SelectItem value="Rest">Rest</SelectItem>
                  <SelectItem value="Holiday">Holiday</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {isWorkingStatus && (
              <div className="space-y-1">
                <Label className="text-xs">Start Time (24h)</Label>
                <Input
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  placeholder="04:00"
                  className="h-8 font-mono"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSave();
                  }}
                />
              </div>
            )}

            <Button size="sm" className="w-full h-8 mt-2" onClick={handleSave}>
              Save
            </Button>

            {booking && (
              <Button
                size="sm"
                variant="outline"
                className="w-full h-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() => setConfirmDelete(true)}
              >
                Clear cell
              </Button>
            )}
          </div>
        </PopoverContent>
      </Popover>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear this cell?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete {workerName}'s {booking ? booking.status : ""} entry for {dateStr} and leave the cell empty. This action is recorded in the activity log and cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </TableCell>
  );
}
