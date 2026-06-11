import { useState } from "react";
import { format, eachDayOfInterval } from "date-fns";
import { GridResponse, Booking, Status, BookingInput } from "@workspace/api-client-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useUpsertBooking, useDeleteBooking, useCreateEvent, useClearNoShow, useUpsertDailyRequirement, getGetGridQueryKey, getGetDashboardSummaryQueryKey, getListAuditQueryKey } from "@workspace/api-client-react";
import type { WorkerType } from "@workspace/api-client-react";
import { EventsDialog } from "./dialogs/EventsDialog";
import { MarkLeaverDialog } from "./dialogs/MarkLeaverDialog";
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
  const createEvent = useCreateEvent();
  const clearNoShow = useClearNoShow();
  const upsertRequirement = useUpsertDailyRequirement();
  const { toast } = useToast();
  const days = eachDayOfInterval({ start, end });
  const [restWarning, setRestWarning] = useState<{ input: BookingInput; message: string } | null>(null);
  const [eventsFor, setEventsFor] = useState<{ id: number; fullName: string; workerType: WorkerType } | null>(null);
  const [leaverFor, setLeaverFor] = useState<{ id: number; fullName: string } | null>(null);

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

  // Set of "workerId|date" cells that have a logged no-show (display-only;
  // read from events data so it persists across refreshes).
  const noShowCells = new Set<string>();
  for (const n of data?.noShows ?? []) {
    noShowCells.add(`${n.workerId}|${n.shiftDate}`);
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

  const handleLogNoShow = (workerId: number, workerName: string, dateStr: string) => {
    createEvent.mutate(
      { data: { workerId, sheetId, eventType: "no_show", eventDate: dateStr } },
      {
        onSuccess: (event) => {
          invalidate();
          if (event.autoFlagged) {
            toast({
              title: `${workerName} flagged Do Not Book`,
              description: "Reached 5 no-shows — removed from the grid. You can allow booking again from the Do Not Book view.",
            });
          } else {
            toast({ title: `No-show logged for ${workerName}` });
          }
        },
        onError: (err: unknown) => {
          const body = (err as { data?: { error?: string } } | undefined)?.data;
          toast({ title: "Could not log no-show", description: body?.error ?? "Please try again.", variant: "destructive" });
        },
      }
    );
  };

  const handleClearNoShow = (workerId: number, workerName: string, dateStr: string) => {
    clearNoShow.mutate(
      { workerId, shiftDate: dateStr },
      {
        onSuccess: (result) => {
          invalidate();
          if (result.autoUnflagged) {
            toast({
              title: `${workerName} no longer Do Not Book`,
              description: "Dropped back below 5 no-shows, so the automatic flag was removed.",
            });
          }
        },
        onError: (err: unknown) => {
          const body = (err as { data?: { error?: string } } | undefined)?.data;
          toast({ title: "Could not clear no-show", description: body?.error ?? "Please try again.", variant: "destructive" });
        },
      }
    );
  };

  const handleRequirementSave = (dateStr: string, raw: string, current: number) => {
    const trimmed = raw.trim();
    const parsed = trimmed === "" ? 0 : Number(trimmed);
    if (!Number.isFinite(parsed) || parsed < 0) {
      toast({ title: "Enter a whole number of 0 or more", variant: "destructive" });
      return;
    }
    const required = Math.floor(parsed);
    if (required === current) return;
    upsertRequirement.mutate(
      { data: { sheetId, shiftDate: dateStr, required } },
      {
        onSuccess: () => invalidate(),
        onError: (err: unknown) => {
          const body = (err as { data?: { error?: string } } | undefined)?.data;
          toast({ title: "Could not save requirement", description: body?.error ?? "Please try again.", variant: "destructive" });
        },
      }
    );
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

  // Requirement coverage per day: Required (sum of shift_requirement quantities
  // for the sheet that day), Filled (workers booked Confirmed/Pre-Booked that
  // day), Still Needed (Required − Filled, floored at zero).
  const requiredByDate = new Map<string, number>();
  for (const r of data.requirements ?? []) {
    requiredByDate.set(r.shiftDate, r.required);
  }
  const coveragePerDay = days.map((day) => {
    const dateStr = format(day, "yyyy-MM-dd");
    const required = requiredByDate.get(dateStr) ?? 0;
    const filled = data.bookings.filter(
      (b) =>
        b.shiftDate === dateStr &&
        (b.status === "Confirmed" || b.status === "Pre-Booked"),
    ).length;
    const stillNeeded = Math.max(0, required - filled);
    // Fill status drives the traffic-light colour. Neutral when nothing is
    // required; red when nothing booked; green when fully covered; amber when
    // partially filled.
    let fill: "none" | "empty" | "partial" | "full";
    if (required === 0) fill = "none";
    else if (filled === 0) fill = "empty";
    else if (filled >= required) fill = "full";
    else fill = "partial";
    return { dateStr, required, filled, stillNeeded, fill };
  });

  const fillCellClass: Record<"none" | "empty" | "partial" | "full", string> = {
    none: "text-muted-foreground",
    empty: "bg-red-100 text-red-700",
    partial: "bg-amber-100 text-amber-800",
    full: "bg-green-100 text-green-700",
  };

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
                  <button
                    type="button"
                    className="-mx-1 block w-full rounded px-1 py-0.5 text-left hover:bg-muted"
                    onClick={() => setEventsFor({ id: worker.id, fullName: worker.fullName, workerType: worker.workerType })}
                    title="Log or view events"
                  >
                    <div>{worker.fullName}</div>
                    {worker.jobRole && <div className="text-xs text-muted-foreground">{worker.jobRole}</div>}
                  </button>
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
                      isNoShow={noShowCells.has(`${worker.id}|${dateStr}`)}
                      onSave={handleCellSave}
                      onDelete={handleCellDelete}
                      onLogNoShow={handleLogNoShow}
                      onClearNoShow={handleClearNoShow}
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
            <TableRow>
              <TableHead colSpan={3} className="border-r text-right font-medium sticky left-0 bg-muted">
                Required
              </TableHead>
              {coveragePerDay.map((c) => (
                <TableHead key={c.dateStr} className="border-r p-1 text-center">
                  <Input
                    key={`${c.dateStr}-${c.required}`}
                    type="number"
                    min={0}
                    step={1}
                    defaultValue={c.required > 0 ? String(c.required) : ""}
                    placeholder="-"
                    aria-label={`Required on ${c.dateStr}`}
                    className="mx-auto h-7 w-12 px-1 text-center text-foreground [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    onBlur={(e) => handleRequirementSave(c.dateStr, e.currentTarget.value, c.required)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") e.currentTarget.blur();
                      else if (e.key === "Escape") {
                        e.currentTarget.value = c.required > 0 ? String(c.required) : "";
                        e.currentTarget.blur();
                      }
                    }}
                  />
                </TableHead>
              ))}
            </TableRow>
            <TableRow>
              <TableHead colSpan={3} className="border-r text-right font-medium sticky left-0 bg-muted">
                Filled
              </TableHead>
              {coveragePerDay.map((c) => (
                <TableHead key={c.dateStr} className="border-r text-center text-foreground">
                  {c.required > 0 || c.filled > 0 ? c.filled : "-"}
                </TableHead>
              ))}
            </TableRow>
            <TableRow>
              <TableHead colSpan={3} className="border-r text-right font-semibold sticky left-0 bg-muted">
                Still Needed
              </TableHead>
              {coveragePerDay.map((c) => (
                <TableHead
                  key={c.dateStr}
                  className={`border-r text-center font-bold ${fillCellClass[c.fill]}`}
                >
                  {c.required > 0 ? c.stillNeeded : "-"}
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
        <div className="flex items-center gap-1"><div className="h-3 w-3 rounded-sm bg-red-600" /> No Show</div>
        <div className="flex items-center gap-1"><span className="flex h-4 min-w-4 items-center justify-center rounded-full border border-slate-300 bg-white px-1 text-[9px] font-bold text-slate-900 leading-none">3</span> HGV consecutive working days</div>
        <div className="ml-2 flex items-center gap-1 border-l pl-3"><div className="h-3 w-3 rounded-sm bg-red-100 border border-red-300" /> None filled</div>
        <div className="flex items-center gap-1"><div className="h-3 w-3 rounded-sm bg-amber-100 border border-amber-300" /> Part filled</div>
        <div className="flex items-center gap-1"><div className="h-3 w-3 rounded-sm bg-green-100 border border-green-300" /> Fully filled</div>
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
          onMarkLeaver={(id, fullName) => {
            setEventsFor(null);
            setLeaverFor({ id, fullName });
          }}
        />
      )}

      {leaverFor && (
        <MarkLeaverDialog
          open={!!leaverFor}
          onOpenChange={(o) => { if (!o) setLeaverFor(null); }}
          workerId={leaverFor.id}
          workerName={leaverFor.fullName}
        />
      )}
    </div>
  );
}

const NO_SHOW_OPTION = "__no_show__";

function BookingCell({ booking, dateStr, workerId, workerName, restDays, isNoShow, onSave, onDelete, onLogNoShow, onClearNoShow }: { booking?: Booking, dateStr: string, workerId: number, workerName: string, restDays?: number, isNoShow?: boolean, onSave: (workerId: number, dateStr: string, status: Status, startTime: string) => void, onDelete: (id: number) => void, onLogNoShow: (workerId: number, workerName: string, dateStr: string) => void, onClearNoShow: (workerId: number, workerName: string, dateStr: string) => void }) {
  const [open, setOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [status, setStatus] = useState<Status | typeof NO_SHOW_OPTION>(booking?.status || "Off");
  const [time, setTime] = useState(booking?.startTime || "");

  const handleSave = () => {
    if (status === NO_SHOW_OPTION) {
      onLogNoShow(workerId, workerName, dateStr);
    } else {
      onSave(workerId, dateStr, status, time);
    }
    setOpen(false);
  };

  const handleDelete = () => {
    // A cell may have a booking, a logged no-show, or both. Deleting the
    // booking also clears any no-show server-side; a no-show-only cell has no
    // booking row, so clear the no-show directly.
    if (booking) onDelete(booking.id);
    else if (isNoShow) onClearNoShow(workerId, workerName, dateStr);
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
    if (isNoShow) return "No Show";
    if (!booking) return "";
    if (booking.status === "Holiday") return "✕";
    if (booking.startTime) return booking.startTime;
    return booking.status;
  };

  // A logged no-show overrides any booking appearance: red cell, white text.
  const cellClass = isNoShow
    ? "bg-red-600 text-white"
    : getStatusClass(booking?.status);

  return (
    <TableCell className="border-r p-0 align-top">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <div
            className={`relative h-full w-full min-h-[48px] cursor-pointer p-2 flex items-center justify-center text-xs font-medium hover:ring-2 hover:ring-inset hover:ring-primary/50 transition-all ${cellClass}`}
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
              <Select value={status} onValueChange={(v) => setStatus(v as Status | typeof NO_SHOW_OPTION)}>
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
                  <SelectItem value={NO_SHOW_OPTION} className="font-medium text-red-600 focus:text-red-600">No Show</SelectItem>
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

            {(booking || isNoShow) && (
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
              {booking
                ? `This will permanently delete ${workerName}'s ${booking.status} entry for ${dateStr}${isNoShow ? " and remove the logged no-show" : ""}, leaving the cell empty. This action is recorded in the activity log and cannot be undone.`
                : `This will remove the logged no-show for ${workerName} on ${dateStr}, leaving the cell empty.`}
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
