import { useState } from "react";
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, addWeeks, subWeeks, addMonths, subMonths, addDays, subDays } from "date-fns";
import { useListSheets, useGetGrid, getGetGridQueryKey, useGetDashboardSummary } from "@workspace/api-client-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { ChevronLeftIcon, ChevronRightIcon, ChevronsUpDownIcon, CheckIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { GridToolbar } from "@/components/grid/GridToolbar";
import { BookingGrid } from "@/components/grid/BookingGrid";
import { DashboardStrip } from "@/components/grid/DashboardStrip";

type ViewMode = "Day" | "Week" | "Month";

export function Grid() {
  const [viewMode, setViewMode] = useState<ViewMode>("Week");
  const [currentDate, setCurrentDate] = useState(new Date());

  const { data: sheets } = useListSheets();
  const [selectedSheetId, setSelectedSheetId] = useState<number | null>(null);
  const [sheetPickerOpen, setSheetPickerOpen] = useState(false);

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
          <Popover open={sheetPickerOpen} onOpenChange={setSheetPickerOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={sheetPickerOpen}
                className="w-[300px] justify-between font-semibold"
              >
                <span className="truncate">
                  {selectedSheet ? selectedSheet.name : "Select Sheet"}
                </span>
                <ChevronsUpDownIcon className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[300px] p-0" align="start">
              <Command>
                <CommandInput placeholder="Search sheets…" />
                <CommandList>
                  <CommandEmpty>No sheets found.</CommandEmpty>
                  <CommandGroup>
                    {sheets?.map((s) => (
                      <CommandItem
                        key={s.id}
                        value={s.name}
                        onSelect={() => {
                          setSelectedSheetId(s.id);
                          setSheetPickerOpen(false);
                        }}
                      >
                        <CheckIcon
                          className={cn(
                            "mr-2 h-4 w-4",
                            selectedSheetId === s.id ? "opacity-100" : "opacity-0"
                          )}
                        />
                        <span className="truncate">
                          {s.name}
                        </span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>

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

      <div className="flex-1 min-h-0 overflow-hidden bg-background">
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
            Select a sheet to view the scheduler, or create one with "New Sheet".
          </div>
        )}
      </div>
    </div>
  );
}
