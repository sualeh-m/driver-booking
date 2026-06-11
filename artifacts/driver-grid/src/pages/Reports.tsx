import { useMemo, useState } from "react";
import {
  useGetOperationalMetrics,
  useListSheets,
  getGetOperationalMetricsQueryKey,
  type GetOperationalMetricsParams,
} from "@workspace/api-client-react";
import {
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  addWeeks,
  addMonths,
  format,
} from "date-fns";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronDownIcon,
} from "lucide-react";

type RangeMode = "weekly" | "monthly" | "custom";
type WorkerTypeFilter = "All" | "HGV" | "Warehouse";

const fmt = (d: Date) => format(d, "yyyy-MM-dd");

export function Reports() {
  const { data: sheets } = useListSheets();

  const [mode, setMode] = useState<RangeMode>("weekly");
  const [refDate, setRefDate] = useState<Date>(new Date());
  const [customFrom, setCustomFrom] = useState<string>("");
  const [customTo, setCustomTo] = useState<string>("");
  const [workerType, setWorkerType] = useState<WorkerTypeFilter>("All");

  // Distinct depot/client combinations, each mapping to one or more sheets.
  const depotClientOptions = useMemo(() => {
    const map = new Map<
      string,
      { key: string; client: string; depot: string | null; sheetIds: number[] }
    >();
    for (const s of sheets ?? []) {
      const key = `${s.clientCompany}|||${s.depot ?? ""}`;
      if (!map.has(key)) {
        map.set(key, {
          key,
          client: s.clientCompany,
          depot: s.depot ?? null,
          sheetIds: [],
        });
      }
      map.get(key)!.sheetIds.push(s.id);
    }
    return [...map.values()].sort((a, b) =>
      `${a.client} ${a.depot ?? ""}`.localeCompare(`${b.client} ${b.depot ?? ""}`),
    );
  }, [sheets]);

  const allKeys = useMemo(
    () => depotClientOptions.map((o) => o.key),
    [depotClientOptions],
  );

  // null = "all" (default). Once the user interacts we materialise an explicit list.
  const [selectedKeys, setSelectedKeys] = useState<string[] | null>(null);
  const effectiveSelected = selectedKeys ?? allKeys;
  const isAllSelected =
    selectedKeys === null ||
    (allKeys.length > 0 && effectiveSelected.length === allKeys.length);

  const toggleKey = (key: string) => {
    const base = selectedKeys ?? allKeys;
    const next = base.includes(key)
      ? base.filter((k) => k !== key)
      : [...base, key];
    setSelectedKeys(next);
  };

  // Date range derived from the selected mode.
  const { start, end, rangeLabel } = useMemo(() => {
    if (mode === "weekly") {
      const s = startOfWeek(refDate, { weekStartsOn: 0 });
      const e = endOfWeek(refDate, { weekStartsOn: 0 });
      return {
        start: fmt(s),
        end: fmt(e),
        rangeLabel: `${format(s, "d MMM")} – ${format(e, "d MMM yyyy")}`,
      };
    }
    if (mode === "monthly") {
      const s = startOfMonth(refDate);
      const e = endOfMonth(refDate);
      return {
        start: fmt(s),
        end: fmt(e),
        rangeLabel: format(s, "MMMM yyyy"),
      };
    }
    return {
      start: customFrom,
      end: customTo,
      rangeLabel:
        customFrom && customTo
          ? `${customFrom} – ${customTo}`
          : "Choose a date range",
    };
  }, [mode, refDate, customFrom, customTo]);

  // Comma-separated sheet IDs for the depot/client filter (undefined = all).
  const sheetIdsParam = useMemo(() => {
    if (isAllSelected) return undefined;
    const ids = depotClientOptions
      .filter((o) => effectiveSelected.includes(o.key))
      .flatMap((o) => o.sheetIds);
    return ids.length ? ids.join(",") : "-1";
  }, [isAllSelected, depotClientOptions, effectiveSelected]);

  const params: GetOperationalMetricsParams = useMemo(() => {
    const p: GetOperationalMetricsParams = { start, end };
    if (workerType !== "All") p.workerType = workerType;
    if (sheetIdsParam !== undefined) p.sheetIds = sheetIdsParam;
    return p;
  }, [start, end, workerType, sheetIdsParam]);

  const rangeReady = Boolean(start && end);

  const { data, isLoading, isFetching } = useGetOperationalMetrics(params, {
    query: {
      enabled: rangeReady,
      queryKey: getGetOperationalMetricsQueryKey(params),
    },
  });

  const depotClientLabel = isAllSelected
    ? "All depots / clients"
    : effectiveSelected.length === 0
      ? "None selected"
      : `${effectiveSelected.length} selected`;

  const metrics = [
    {
      label: "Active workers",
      value: data?.activeWorkers,
      hint: "Status active, matching the filters",
    },
    {
      label: "Requirements received",
      value: data?.requirementsReceived,
      hint: "Sum of shift requirements in range",
    },
    {
      label: "Filled",
      value: data?.filled,
      hint: "Bookings Confirmed or Pre-Booked",
    },
    {
      label: "Fill rate",
      value:
        data == null
          ? undefined
          : data.fillRate == null
            ? "—"
            : `${data.fillRate}%`,
      hint: "Filled ÷ requirements",
    },
    {
      label: "No-shows",
      value: data?.noShows,
      hint: "No-show events in range",
    },
  ];

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-4">
        <h1 className="text-2xl font-semibold">KPI Reports</h1>
        <p className="text-sm text-muted-foreground">
          Operational metrics. Filters apply to every metric below.
        </p>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">Filters</CardTitle>
          <CardDescription>{rangeLabel}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Date range */}
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">
                Date range
              </label>
              <div className="flex items-center gap-1">
                {(["weekly", "monthly", "custom"] as RangeMode[]).map((m) => (
                  <Button
                    key={m}
                    size="sm"
                    variant={mode === m ? "secondary" : "ghost"}
                    onClick={() => setMode(m)}
                    className="capitalize"
                  >
                    {m === "custom" ? "Custom" : m}
                  </Button>
                ))}
              </div>
            </div>

            {mode === "weekly" && (
              <div className="flex items-center gap-1">
                <Button
                  size="icon"
                  variant="outline"
                  onClick={() => setRefDate((d) => addWeeks(d, -1))}
                  title="Previous week"
                >
                  <ChevronLeftIcon className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setRefDate(new Date())}
                >
                  This week
                </Button>
                <Button
                  size="icon"
                  variant="outline"
                  onClick={() => setRefDate((d) => addWeeks(d, 1))}
                  title="Next week"
                >
                  <ChevronRightIcon className="h-4 w-4" />
                </Button>
              </div>
            )}

            {mode === "monthly" && (
              <div className="flex items-center gap-1">
                <Button
                  size="icon"
                  variant="outline"
                  onClick={() => setRefDate((d) => addMonths(d, -1))}
                  title="Previous month"
                >
                  <ChevronLeftIcon className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setRefDate(new Date())}
                >
                  This month
                </Button>
                <Button
                  size="icon"
                  variant="outline"
                  onClick={() => setRefDate((d) => addMonths(d, 1))}
                  title="Next month"
                >
                  <ChevronRightIcon className="h-4 w-4" />
                </Button>
              </div>
            )}

            {mode === "custom" && (
              <div className="flex items-end gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">
                    From
                  </label>
                  <Input
                    type="date"
                    value={customFrom}
                    onChange={(e) => setCustomFrom(e.target.value)}
                    className="w-40"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">
                    To
                  </label>
                  <Input
                    type="date"
                    value={customTo}
                    onChange={(e) => setCustomTo(e.target.value)}
                    className="w-40"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Depot/client + worker type */}
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">
                Depot / client
              </label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="w-56 justify-between">
                    {depotClientLabel}
                    <ChevronDownIcon className="h-4 w-4 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-64 p-2" align="start">
                  <div className="mb-2 flex items-center justify-between px-1">
                    <span className="text-xs font-medium text-muted-foreground">
                      Include
                    </span>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs"
                        onClick={() => setSelectedKeys(null)}
                      >
                        All
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs"
                        onClick={() => setSelectedKeys([])}
                      >
                        None
                      </Button>
                    </div>
                  </div>
                  <div className="max-h-64 space-y-1 overflow-auto">
                    {depotClientOptions.length === 0 ? (
                      <p className="px-1 py-2 text-xs text-muted-foreground">
                        No sheets yet.
                      </p>
                    ) : (
                      depotClientOptions.map((o) => (
                        <label
                          key={o.key}
                          className="flex cursor-pointer items-center gap-2 rounded px-1 py-1.5 text-sm hover:bg-muted"
                        >
                          <Checkbox
                            checked={effectiveSelected.includes(o.key)}
                            onCheckedChange={() => toggleKey(o.key)}
                          />
                          <span className="leading-tight">
                            {o.client}
                            {o.depot ? (
                              <span className="text-muted-foreground">
                                {" "}
                                — {o.depot}
                              </span>
                            ) : null}
                          </span>
                        </label>
                      ))
                    )}
                  </div>
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">
                Worker type
              </label>
              <div className="flex items-center gap-1">
                {(["All", "HGV", "Warehouse"] as WorkerTypeFilter[]).map((wt) => (
                  <Button
                    key={wt}
                    size="sm"
                    variant={workerType === wt ? "secondary" : "ghost"}
                    onClick={() => setWorkerType(wt)}
                  >
                    {wt}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {!rangeReady ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Choose a date range to see metrics.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {metrics.map((m) => (
            <Card key={m.label}>
              <CardHeader className="pb-2">
                <CardDescription>{m.label}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold tabular-nums">
                  {isLoading || m.value === undefined ? (
                    <span className="text-muted-foreground">…</span>
                  ) : (
                    m.value
                  )}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{m.hint}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {rangeReady && isFetching && !isLoading && (
        <p className="mt-3 text-xs text-muted-foreground">Updating…</p>
      )}
    </div>
  );
}
