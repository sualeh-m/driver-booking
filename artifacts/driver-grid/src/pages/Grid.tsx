import { useState } from "react";
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, addWeeks, subWeeks, addMonths, subMonths, addDays, subDays } from "date-fns";
import { useListSheets, useGetGrid, getGetGridQueryKey, useGetDashboardSummary } from "@workspace/api-client-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { GridToolbar } from "@/components/grid/GridToolbar";
import { BookingGrid } from "@/components/grid/BookingGrid";
import { DashboardStrip } from "@/components/grid/DashboardStrip";

type ViewMode = "Day" | "Week" | "Month";

export function Grid() {
  const [viewMode, setViewMode] = useState<ViewMode>("Week");
  const [currentDate, setCurrentDate] = useState(new Date());

  const { data: sheets } = useListSheets();
  const [selectedSheetId, setSelectedSheetId] = useState<number | null>(null);

  // Auto-select first sheet
  if (sheets && sheets.length > 0 && selectedSheetId === null) {
    setSelectedSheetId(sheets[0].id);
  }

  const selectedSheet = sheets?.find((s) => s.id === selectedSheetId) ?? null;

  const getRange = () => {
    switch (viewMode) {
      case "Day":
        return { start: currentDate, end: currentDate };
      case "Week":
        return { start: startOfWeek(currentDate, { weekStartsOn: 0 }), end: endOfWeek(currentDate, { weekStartsOn: 0 }) };
      case "Month":
        return { start: startOfMonth(currentDate), end: endOfMonth(currentDate) };
    }
  };

  const { start, end } = getRange();
  const startStr = format(start, "yyyy-MM-dd");
  const endStr = format(end, "yyyy-MM-dd");

  const { data: gridData, isLoading: isLoadingGrid } = useGetGrid(
    { sheetId: selectedSheetId || 0, start: startStr, end: endStr },
    { query: { enabled: !!selectedSheetId, queryKey: getGetGridQueryKey({ sheetId: selectedSheetId || 0, start: startStr, end: endStr }) } }
  );

  const { data: summary } = useGetDashboardSummary();

  const handlePrev = () => {
    switch (viewMode) {
      case "Day": setCurrentDate(subDays(currentDate, 1)); break;
      case "Week": setCurrentDate(subWeeks(currentDate, 1)); break;
      case "Month": setCurrentDate(subMonths(currentDate, 1)); break;
    }
  };

  const handleNext = () => {
    switch (viewMode) {
      case "Day": setCurrentDate(addDays(currentDate, 1)); break;
      case "Week": setCurrentDate(addWeeks(currentDate, 1)); break;
      case "Month": setCurrentDate(addMonths(currentDate, 1)); break;
    }
  };

  return (
    <div className="flex h-full flex-col">
      <DashboardStrip summary={summary} />

      <div className="flex items-center justify-between border-b bg-card p-4">
        <div className="flex items-center gap-4">
          <Select
            value={selectedSheetId?.toString() ?? ""}
            onValueChange={(val) => setSelectedSheetId(Number(val))}
          >
            <SelectTrigger className="w-[300px] font-semibold">
              <SelectValue placeholder="Select Sheet" />
            </SelectTrigger>
            <SelectContent>
              {sheets?.map((s) => (
                <SelectItem key={s.id} value={s.id.toString()}>
                  {s.name} — {s.clientCompany}{s.depot ? ` (${s.depot})` : ""} · {s.workerType}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex items-center gap-2 rounded-md border p-1 bg-muted/50">
            {(["Day", "Week", "Month"] as const).map((mode) => (
              <Button
                key={mode}
                variant={viewMode === mode ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setViewMode(mode)}
                className="px-3"
              >
                {mode}
              </Button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={handlePrev}>
              <ChevronLeftIcon className="h-4 w-4" />
            </Button>
            <div className="w-[200px] text-center font-medium">
              {viewMode === "Day" && format(currentDate, "MMMM d, yyyy")}
              {viewMode === "Week" && `${format(start, "MMM d")} - ${format(end, "MMM d, yyyy")}`}
              {viewMode === "Month" && format(currentDate, "MMMM yyyy")}
            </div>
            <Button variant="outline" size="icon" onClick={handleNext}>
              <ChevronRightIcon className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <GridToolbar sheet={selectedSheet} start={start} end={end} bookings={gridData?.bookings} workers={gridData?.workers} onSheetDeleted={() => setSelectedSheetId(null)} />
      </div>

      <div className="flex-1 overflow-hidden bg-background">
        {selectedSheetId ? (
          <BookingGrid
            sheetId={selectedSheetId}
            start={start}
            end={end}
            data={gridData}
            isLoading={isLoadingGrid}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            Select a sheet to view the grid, or create one with "New Sheet".
          </div>
        )}
      </div>
    </div>
  );
}
