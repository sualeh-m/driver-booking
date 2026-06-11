import { useState } from "react";
import { format, eachDayOfInterval, isSameDay } from "date-fns";
import { GridResponse, Booking, Status } from "@workspace/api-client-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useUpsertBooking, useDeleteBooking, getGetGridQueryKey, getGetDashboardSummaryQueryKey, getListAuditQueryKey } from "@workspace/api-client-react";
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
  contractId: number;
  start: Date;
  end: Date;
  data?: GridResponse;
  isLoading: boolean;
}

export function BookingGrid({ contractId, start, end, data, isLoading }: BookingGridProps) {
  const queryClient = useQueryClient();
  const upsertBooking = useUpsertBooking();
  const deleteBooking = useDeleteBooking();
  const days = eachDayOfInterval({ start, end });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getGetGridQueryKey({ contractId, start: format(start, "yyyy-MM-dd"), end: format(end, "yyyy-MM-dd") }) });
    queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListAuditQueryKey({}) });
  };

  const handleCellSave = (driverId: number, dateStr: string, status: Status, startTime: string) => {
    upsertBooking.mutate(
      { data: { contractId, driverId, shiftDate: dateStr, status, startTime: startTime || null } },
      { onSuccess: invalidate }
    );
  };

  const handleCellDelete = (id: number) => {
    deleteBooking.mutate({ id }, { onSuccess: invalidate });
  };

  if (isLoading) {
    return <div className="p-8 text-center text-muted-foreground">Loading grid...</div>;
  }

  if (!data?.drivers.length) {
    return <div className="p-8 text-center text-muted-foreground">No drivers linked to this contract.</div>;
  }

  // Count working shifts per day
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
              <TableHead className="w-[200px] border-r">Driver</TableHead>
              <TableHead className="w-[120px] border-r">Phone</TableHead>
              <TableHead className="w-[120px] border-r">Role</TableHead>
              {days.map((day) => (
                <TableHead key={day.toISOString()} className="min-w-[100px] border-r text-center">
                  <div className="font-semibold">{format(day, "EEE")}</div>
                  <div className="text-xs text-muted-foreground">{format(day, "MMM d")}</div>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.drivers.map((driver) => (
              <TableRow key={driver.id}>
                <TableCell className="border-r font-medium sticky left-0 bg-background">{driver.fullName}</TableCell>
                <TableCell className="border-r text-xs text-muted-foreground">{driver.phone || "-"}</TableCell>
                <TableCell className="border-r text-xs">{driver.jobRole || "-"}</TableCell>
                {days.map((day) => {
                  const dateStr = format(day, "yyyy-MM-dd");
                  const booking = data.bookings.find(
                    (b) => b.driverId === driver.id && b.shiftDate === dateStr
                  );
                  return (
                    <BookingCell
                      key={`${driver.id}-${dateStr}`}
                      booking={booking}
                      dateStr={dateStr}
                      driverId={driver.id}
                      driverName={driver.fullName}
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

      <div className="border-t bg-card p-2 flex items-center justify-end gap-4 text-xs">
        <div className="flex items-center gap-1"><div className="h-3 w-3 rounded-sm status-available" /> Available</div>
        <div className="flex items-center gap-1"><div className="h-3 w-3 rounded-sm status-pre-booked" /> Pre-Booked</div>
        <div className="flex items-center gap-1"><div className="h-3 w-3 rounded-sm status-confirmed" /> Confirmed</div>
        <div className="flex items-center gap-1"><div className="h-3 w-3 rounded-sm status-rest" /> Rest</div>
        <div className="flex items-center gap-1"><div className="h-3 w-3 rounded-sm status-off" /> Off</div>
        <div className="flex items-center gap-1"><div className="h-3 w-3 rounded-sm status-holiday" /> Holiday</div>
      </div>
    </div>
  );
}

function BookingCell({ booking, dateStr, driverId, driverName, onSave, onDelete }: { booking?: Booking, dateStr: string, driverId: number, driverName: string, onSave: (driverId: number, dateStr: string, status: Status, startTime: string) => void, onDelete: (id: number) => void }) {
  const [open, setOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [status, setStatus] = useState<Status>(booking?.status || "Off");
  const [time, setTime] = useState(booking?.startTime || "");

  const handleSave = () => {
    onSave(driverId, dateStr, status, time);
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

  return (
    <TableCell className="border-r p-0 align-top">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <div 
            className={`h-full w-full min-h-[48px] cursor-pointer p-2 flex items-center justify-center text-xs font-medium hover:ring-2 hover:ring-inset hover:ring-primary/50 transition-all ${getStatusClass(booking?.status)}`}
          >
            {booking?.startTime ? booking.startTime : (!booking ? "" : booking?.status)}
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
              This will permanently delete {driverName}'s {booking ? booking.status : ""} entry for {dateStr} and leave the cell empty. This action is recorded in the activity log and cannot be undone.
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
