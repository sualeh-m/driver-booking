import { useState, useEffect, useRef, useCallback } from "react";
import { format, eachDayOfInterval } from "date-fns";
import { GridResponse, Booking, Status, BookingInput } from "@workspace/api-client-react";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Popover, PopoverContent, PopoverAnchor } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useUpsertBooking, useDeleteBooking, useCreateEvent, useClearNoShow, useUpsertDailyRequirement, useUpsertBookingsBatch, getGetGridQueryKey, getGetDashboardSummaryQueryKey, getListAuditQueryKey } from "@workspace/api-client-react";
import type { WorkerType, BatchBookingResult } from "@workspace/api-client-react";
import { EventsDialog } from "./dialogs/EventsDialog";
import { MarkLeaverDialog } from "./dialogs/MarkLeaverDialog";
import { WorkerProfileDialog } from "./dialogs/WorkerProfileDialog";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

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
  const [profileFor, setProfileFor] = useState<{ id: number; fullName: string; workerType: WorkerType; note: string | null } | null>(null);

  // --- Drag-fill selection ---------------------------------------------------
  // Selection is tracked by grid coordinates (worker row index × day column
  // index). A single cell (no drag) opens that cell's editor popover; two or
  // more cells open the batch-fill dialog.
  const upsertBatch = useUpsertBookingsBatch();
  const [openCellKey, setOpenCellKey] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ anchor: [number, number]; current: [number, number] } | null>(null);
  const pointerDown = useRef(false);
  const [batch, setBatch] = useState<{ cells: { workerId: number; shiftDate: string }[] } | null>(null);
  const [batchWarn, setBatchWarn] = useState<{
    status: Status;
    startTime: string | null;
    note: string | null;
    applied: BatchBookingResult["applied"];
    warnings: BatchBookingResult["warnings"];
    blocked: BatchBookingResult["blocked"];
    conflicts: BatchBookingResult["conflicts"];
  } | null>(null);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getGetGridQueryKey({ sheetId, start: format(start, "yyyy-MM-dd"), end: format(end, "yyyy-MM-dd") }) });
    queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListAuditQueryKey({}) });
  };

  // Begin a drag from a cell (worker row index × day column index).
  const beginDrag = useCallback((wi: number, di: number) => {
    pointerDown.current = true;
    setOpenCellKey(null);
    setDrag({ anchor: [wi, di], current: [wi, di] });
  }, []);

  // Extend the drag rectangle as the pointer enters another cell.
  const extendDrag = useCallback((wi: number, di: number) => {
    if (!pointerDown.current) return;
    setDrag((d) => (d ? { anchor: d.anchor, current: [wi, di] } : d));
  }, []);

  const inSelection = (wi: number, di: number): boolean => {
    if (!drag) return false;
    const [aw, ad] = drag.anchor;
    const [cw, cd] = drag.current;
    return (
      wi >= Math.min(aw, cw) && wi <= Math.max(aw, cw) &&
      di >= Math.min(ad, cd) && di <= Math.max(ad, cd)
    );
  };

  // Resolve the drag on pointer-up: a single cell opens its editor popover, a
  // rectangle of two or more opens the batch-fill dialog. Held in a ref so the
  // window listener is bound once but always sees the latest selection.
  const finishRef = useRef<() => void>(() => {});
  finishRef.current = () => {
    if (!pointerDown.current) return;
    pointerDown.current = false;
    const d = drag;
    setDrag(null);
    if (!d || !data) return;
    const [aw, ad] = d.anchor;
    const [cw, cd] = d.current;
    const wLo = Math.min(aw, cw), wHi = Math.max(aw, cw);
    const dLo = Math.min(ad, cd), dHi = Math.max(ad, cd);
    const cells: { workerId: number; shiftDate: string }[] = [];
    for (let wi = wLo; wi <= wHi; wi++) {
      const worker = data.workers[wi];
      if (!worker) continue;
      for (let di = dLo; di <= dHi; di++) {
        cells.push({ workerId: worker.id, shiftDate: format(days[di], "yyyy-MM-dd") });
      }
    }
    if (cells.length === 1) {
      setOpenCellKey(`${cells[0].workerId}|${cells[0].shiftDate}`);
    } else if (cells.length > 1) {
      setBatch({ cells });
    }
  };

  useEffect(() => {
    const onUp = () => finishRef.current();
    window.addEventListener("mouseup", onUp);
    return () => window.removeEventListener("mouseup", onUp);
  }, []);

  const summarizeBatch = (result: BatchBookingResult) => {
    const savedN = result.applied.length;
    const blockedN = result.blocked.length;
    const conflictN = result.conflicts.length;
    if (savedN === 0 && (blockedN > 0 || conflictN > 0)) {
      const reasons: string[] = [];
      if (blockedN > 0) reasons.push(`${blockedN} at the HGV 7-day rest limit`);
      if (conflictN > 0) reasons.push(`${conflictN} already working on another sheet`);
      toast({
        title: "Nothing saved",
        description: reasons.join(" · "),
        variant: "destructive",
      });
      return;
    }
    const parts = [`${savedN} cell${savedN === 1 ? "" : "s"} updated`];
    if (blockedN > 0) parts.push(`${blockedN} blocked (HGV 7-day rest limit)`);
    if (conflictN > 0) parts.push(`${conflictN} skipped (already working elsewhere)`);
    toast({ title: "Drag-fill applied", description: parts.join(" · ") });
  };

  const batchError = (err: unknown) => {
    const body = (err as { data?: { error?: string } } | undefined)?.data;
    toast({ title: "Could not apply", description: body?.error ?? "Please try again.", variant: "destructive" });
  };

  // First pass: ok cells are applied immediately; warned cells are held back and
  // surfaced for confirmation, blocked cells reported. ack is always false here.
  const runBatch = (
    cells: { workerId: number; shiftDate: string }[],
    status: Status,
    startTime: string | null,
    note: string | null,
  ) => {
    upsertBatch.mutate(
      { data: { sheetId, status, startTime, note, cells, acknowledgeRestWarning: false } },
      {
        onSuccess: (result) => {
          invalidate();
          setBatch(null);
          if (result.warnings.length > 0) {
            setBatchWarn({ status, startTime, note, applied: result.applied, warnings: result.warnings, blocked: result.blocked, conflicts: result.conflicts });
          } else {
            setBatchWarn(null);
            summarizeBatch(result);
          }
        },
        onError: batchError,
      },
    );
  };

  // Second pass: resubmit ONLY the warned cells with the warning acknowledged.
  // The first-pass ok cells are already persisted, so re-evaluating just the
  // warned dates yields the same decisions — we never rewrite already-saved
  // cells (avoids clobbering concurrent edits / bumping updatedAt).
  const confirmBatchWarn = () => {
    if (!batchWarn) return;
    const prior = batchWarn;
    const ackCells = prior.warnings.map((w) => ({ workerId: w.workerId, shiftDate: w.shiftDate }));
    upsertBatch.mutate(
      { data: { sheetId, status: prior.status, startTime: prior.startTime, note: prior.note, cells: ackCells, acknowledgeRestWarning: true } },
      {
        onSuccess: (result) => {
          invalidate();
          setBatchWarn(null);
          // A warned cell can come back blocked if a concurrent write between
          // the two passes pushed it over the limit, so fold the ack pass's
          // blocked cells into the summary too (they're disjoint from prior
          // blocked — these were warnings last pass).
          summarizeBatch({
            applied: [...prior.applied, ...result.applied],
            warnings: [],
            blocked: [...prior.blocked, ...result.blocked],
            conflicts: [...prior.conflicts, ...result.conflicts],
          });
        },
        onError: batchError,
      },
    );
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
          } else if (body?.code === "CROSS_SHEET_CONFLICT") {
            setRestWarning(null);
            toast({ title: "Already working elsewhere", description: message, variant: "destructive" });
          } else {
            toast({ title: "Failed to save booking", description: message, variant: "destructive" });
          }
        },
      }
    );
  };

  const handleCellSave = (workerId: number, dateStr: string, status: Status, startTime: string, note: string) => {
    saveBooking({ sheetId, workerId, shiftDate: dateStr, status, startTime: startTime || null, note: note.trim() || null });
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

  // Day view (a single date) should stay compact — let the table take its
  // natural width so the lone date column does not stretch across the screen.
  // Week/Month fill the width; Month overflows and scrolls horizontally.
  const isDayView = days.length === 1;
  // Past dates are dimmed; today is highlighted. Compared as ISO date strings.
  const todayStr = format(new Date(), "yyyy-MM-dd");

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 min-h-0 overflow-auto">
        <table className={`caption-bottom text-sm border-collapse select-none ${isDayView ? "w-auto" : "w-full"}`}>
          <TableHeader className="sticky top-0 z-10 bg-muted/80 backdrop-blur">
            <TableRow>
              <TableHead className="w-[260px] border-r sticky left-0 z-20 bg-muted">Worker</TableHead>
              <TableHead className="w-[160px] border-r">Phone</TableHead>
              <TableHead className="w-[240px] border-r">Standing Note</TableHead>
              {days.map((day) => {
                const dStr = format(day, "yyyy-MM-dd");
                const isPast = dStr < todayStr;
                const isToday = dStr === todayStr;
                return (
                  <TableHead
                    key={day.toISOString()}
                    className={`min-w-[100px] border-r text-center ${isToday ? "bg-primary/10 ring-1 ring-inset ring-primary/40" : isPast ? "bg-muted/60 text-muted-foreground" : ""}`}
                  >
                    <div className={`font-semibold ${isToday ? "text-primary" : ""}`}>{format(day, "EEE")}</div>
                    <div className="text-xs text-muted-foreground">{format(day, "MMM d")}{isToday ? " · Today" : ""}</div>
                  </TableHead>
                );
              })}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.workers.map((worker, wi) => (
              <TableRow key={worker.id}>
                <TableCell className="w-[260px] whitespace-nowrap border-r py-0.5 font-medium sticky left-0 bg-background" style={{ backgroundColor: roleCellBg(worker.jobRole) }}>
                  <button
                    type="button"
                    className="-mx-1 block w-full rounded px-1 py-0.5 text-left leading-tight hover:bg-muted"
                    onClick={() => setProfileFor({ id: worker.id, fullName: worker.fullName, workerType: worker.workerType, note: worker.note ?? null })}
                    title="View or edit worker"
                  >
                    <span className="text-xs">{worker.fullName}</span>
                    {worker.jobRole && (
                      <span className="text-[11px] text-muted-foreground">
                        {" · "}
                        {worker.jobRole === "Other" && worker.customJobTitle
                          ? worker.customJobTitle
                          : worker.jobRole}
                      </span>
                    )}
                  </button>
                </TableCell>
                <TableCell className="w-[160px] whitespace-nowrap border-r py-0.5 text-[11px] text-muted-foreground">{worker.phone || "-"}</TableCell>
                <TableCell className="w-[240px] whitespace-nowrap border-r py-0.5 text-[11px] text-muted-foreground">{worker.note || "-"}</TableCell>
                {days.map((day, di) => {
                  const dateStr = format(day, "yyyy-MM-dd");
                  const booking = data.bookings.find(
                    (b) => b.workerId === worker.id && b.shiftDate === dateStr
                  );
                  const cellKey = `${worker.id}|${dateStr}`;
                  return (
                    <BookingCell
                      key={`${worker.id}-${dateStr}`}
                      booking={booking}
                      dateStr={dateStr}
                      workerId={worker.id}
                      workerName={worker.fullName}
                      restDays={restCounters.get(cellKey)}
                      isNoShow={noShowCells.has(cellKey)}
                      isPast={dateStr < todayStr}
                      isToday={dateStr === todayStr}
                      open={openCellKey === cellKey}
                      onOpenChange={(o) => setOpenCellKey(o ? cellKey : null)}
                      selected={inSelection(wi, di)}
                      onPointerDown={() => beginDrag(wi, di)}
                      onPointerEnter={() => extendDrag(wi, di)}
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
        </table>
      </div>

      <div className="border-t bg-card p-2 flex flex-wrap items-center justify-end gap-4 text-xs">
        <div className="flex items-center gap-1"><div className="h-3 w-3 rounded-sm status-available" /> Available</div>
        <div className="flex items-center gap-1"><div className="h-3 w-3 rounded-sm status-pre-booked" /> Pre-Booked</div>
        <div className="flex items-center gap-1"><div className="h-3 w-3 rounded-sm status-confirmed" /> Confirmed</div>
        <div className="flex items-center gap-1"><div className="h-3 w-3 rounded-sm border status-rest" /> Rest</div>
        <div className="flex items-center gap-1"><div className="h-3 w-3 rounded-sm border status-off" /> Off</div>
        <div className="flex items-center gap-1"><div className="h-3 w-3 rounded-sm status-holiday"></div> Holiday</div>
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

      {batch && (
        <BatchFillDialog
          count={batch.cells.length}
          pending={upsertBatch.isPending}
          onCancel={() => setBatch(null)}
          onApply={(status, startTime, note) => runBatch(batch.cells, status, startTime, note)}
        />
      )}

      <AlertDialog open={!!batchWarn} onOpenChange={(o) => { if (!o) setBatchWarn(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rest-day warning</AlertDialogTitle>
            <AlertDialogDescription>
              {batchWarn && (
                <>
                  {batchWarn.warnings.length} cell{batchWarn.warnings.length === 1 ? "" : "s"} would reach the {""}
                  rest-day warning threshold for HGV worker{batchWarn.warnings.length === 1 ? "" : "s"} (no rest day).
                  {batchWarn.blocked.length > 0 && ` ${batchWarn.blocked.length} cell${batchWarn.blocked.length === 1 ? "" : "s"} are over the limit and cannot be saved.`}
                  {" "}Book the warned shift{batchWarn.warnings.length === 1 ? "" : "s"} anyway?
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { if (batchWarn) summarizeBatch({ applied: batchWarn.applied, warnings: [], blocked: batchWarn.blocked, conflicts: batchWarn.conflicts }); }}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmBatchWarn}>
              Book anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {profileFor && (
        <WorkerProfileDialog
          open={!!profileFor}
          onOpenChange={(o) => { if (!o) setProfileFor(null); }}
          workerId={profileFor.id}
          sheetId={sheetId}
          note={profileFor.note}
          onOpenEvents={() => {
            setEventsFor({ id: profileFor.id, fullName: profileFor.fullName, workerType: profileFor.workerType });
            setProfileFor(null);
          }}
        />
      )}

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

// Worker-name CELL background shading by job role — a system independent of the
// status cell colours. Soft, PALE, desaturated fills so the normal dark name
// text stays clearly readable on top. Unknown/null roles fall back to the
// default cell background.
const ROLE_CELL_BG: Record<string, string> = {
  "HGV 1": "#dfeae0",        // pale green
  "HGV 2": "#d9e8e8",        // pale teal
  "Trunker": "#e6e0ee",      // pale light purple
  "Coach": "#eedfe6",        // pale dusty rose
  "Van": "#dde6f0",          // pale soft blue
  "Forklift": "#efe6cf",     // pale muted amber
  "Drivers Mate": "#e0e5ec", // pale grey-blue
  "Warehouse": "#eae0d4",    // pale soft brown/tan
  "Other": "#e6e6e9",        // pale grey
};
function roleCellBg(jobRole?: string | null): string | undefined {
  if (!jobRole) return undefined;
  return ROLE_CELL_BG[jobRole];
}

const NO_SHOW_OPTION = "__no_show__";

function BookingCell({ booking, dateStr, workerId, workerName, restDays, isNoShow, isPast, isToday, open, onOpenChange, selected, onPointerDown, onPointerEnter, onSave, onDelete, onLogNoShow, onClearNoShow }: { booking?: Booking, dateStr: string, workerId: number, workerName: string, restDays?: number, isNoShow?: boolean, isPast?: boolean, isToday?: boolean, open: boolean, onOpenChange: (open: boolean) => void, selected: boolean, onPointerDown: () => void, onPointerEnter: () => void, onSave: (workerId: number, dateStr: string, status: Status, startTime: string, note: string) => void, onDelete: (id: number) => void, onLogNoShow: (workerId: number, workerName: string, dateStr: string) => void, onClearNoShow: (workerId: number, workerName: string, dateStr: string) => void }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [status, setStatus] = useState<Status | typeof NO_SHOW_OPTION>(booking?.status || "Off");
  const [time, setTime] = useState(booking?.startTime || "");
  const [note, setNote] = useState(booking?.note || "");

  // Re-sync the editor to the current booking each time the popover opens, so a
  // controlled (re-)open never shows a stale status/time/note from a prior edit.
  useEffect(() => {
    if (open) {
      setStatus(booking?.status || "Off");
      setTime(booking?.startTime || "");
      setNote(booking?.note || "");
    }
  }, [open, booking?.status, booking?.startTime, booking?.note]);

  const handleSave = () => {
    if (status === NO_SHOW_OPTION) {
      onLogNoShow(workerId, workerName, dateStr);
    } else {
      onSave(workerId, dateStr, status, time, note);
    }
    onOpenChange(false);
  };

  const handleDelete = () => {
    // A cell may have a booking, a logged no-show, or both. Deleting the
    // booking also clears any no-show server-side; a no-show-only cell has no
    // booking row, so clear the no-show directly.
    if (booking) onDelete(booking.id);
    else if (isNoShow) onClearNoShow(workerId, workerName, dateStr);
    setConfirmDelete(false);
    onOpenChange(false);
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
    if (booking.status === "Holiday") return "Holiday";
    if (booking.startTime) return booking.startTime;
    return booking.status;
  };

  // A logged no-show overrides any booking appearance: red cell, white text.
  const cellClass = isNoShow
    ? "bg-red-600 text-white"
    : getStatusClass(booking?.status);

  return (
    <TableCell className={`border-r p-0 align-top ${isPast ? "bg-muted/50" : isToday ? "bg-primary/5" : ""}`}>
      <Popover open={open} onOpenChange={onOpenChange}>
        <PopoverAnchor asChild>
          <div
            onMouseDown={(e) => {
              if (e.button !== 0) return;
              e.preventDefault();
              onPointerDown();
            }}
            onMouseEnter={onPointerEnter}
            className={`relative h-full w-full min-h-[28px] cursor-pointer p-1 flex items-center justify-center text-xs font-medium transition-all ${cellClass} ${isPast ? "opacity-70" : ""} ${selected ? "ring-2 ring-inset ring-primary" : "hover:ring-2 hover:ring-inset hover:ring-primary/50"}`}
          >
            {restDays != null && restDays > 0 && (
              <span
                title={`${restDays} consecutive working day${restDays === 1 ? "" : "s"} since last rest`}
                className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full border border-slate-300 bg-white px-1 text-[9px] font-bold leading-none text-slate-900"
              >
                {restDays}
              </span>
            )}
            {!isNoShow && booking?.note && (
              <span
                title={booking.note}
                aria-label={`Note: ${booking.note}`}
                className="absolute bottom-0.5 left-0.5 text-[10px] leading-none"
              >
                📝
              </span>
            )}
            {renderContent()}
          </div>
        </PopoverAnchor>
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

            {status !== NO_SHOW_OPTION && (
              <div className="space-y-1">
                <Label className="text-xs">Note (optional)</Label>
                <Textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="e.g. call transport on arrival"
                  className="min-h-[56px] text-xs"
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

function BatchFillDialog({ count, pending, onCancel, onApply }: { count: number, pending: boolean, onCancel: () => void, onApply: (status: Status, startTime: string | null, note: string | null) => void }) {
  const [status, setStatus] = useState<Status>("Confirmed");
  const [time, setTime] = useState("");
  const [note, setNote] = useState("");
  const isWorkingStatus = ["Available", "Pre-Booked", "Confirmed"].includes(status);

  const handleApply = () => {
    // Match single-cell editing: a blank time is allowed (saved as null). Only
    // working statuses can carry a time, and even then it stays optional. The
    // note is always optional and applies to every selected cell.
    onApply(status, isWorkingStatus && time ? time : null, note.trim() || null);
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onCancel(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Fill {count} cells</DialogTitle>
          <DialogDescription>
            Apply a status to all {count} selected cells. Each is saved individually, with the same rules and audit trail as a single edit. HGV rest-day limits are checked per cell.
          </DialogDescription>
        </DialogHeader>
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
                onKeyDown={(e) => { if (e.key === "Enter") handleApply(); }}
              />
            </div>
          )}

          <div className="space-y-1">
            <Label className="text-xs">Note (optional)</Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. needs to finish before 1pm"
              className="min-h-[56px] text-xs"
            />
          </div>
        </div>
        <DialogFooter>
          <Button size="sm" variant="outline" onClick={onCancel} disabled={pending}>Cancel</Button>
          <Button size="sm" onClick={handleApply} disabled={pending}>
            {pending ? "Applying…" : `Apply to ${count} cells`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
