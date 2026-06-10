import { DashboardSummary } from "@workspace/api-client-react";
import { UsersIcon, CheckCircleIcon, BriefcaseIcon, CalendarIcon, ActivityIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export function DashboardStrip({ summary }: { summary?: DashboardSummary }) {
  if (!summary) return null;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 p-4 bg-muted/20 border-b">
      <div className="flex items-center gap-3 rounded-lg border bg-card p-3 shadow-sm">
        <div className="rounded-full bg-primary/10 p-2 text-primary">
          <UsersIcon className="h-4 w-4" />
        </div>
        <div>
          <div className="text-2xl font-bold">{summary.totalDrivers}</div>
          <div className="text-xs text-muted-foreground">Total Drivers</div>
        </div>
      </div>
      <div className="flex items-center gap-3 rounded-lg border bg-card p-3 shadow-sm">
        <div className="rounded-full bg-green-500/10 p-2 text-green-600">
          <ActivityIcon className="h-4 w-4" />
        </div>
        <div>
          <div className="text-2xl font-bold">{summary.totalActiveDrivers}</div>
          <div className="text-xs text-muted-foreground">Active Drivers</div>
        </div>
      </div>
      <div className="flex items-center gap-3 rounded-lg border bg-card p-3 shadow-sm">
        <div className="rounded-full bg-blue-500/10 p-2 text-blue-600">
          <BriefcaseIcon className="h-4 w-4" />
        </div>
        <div>
          <div className="text-2xl font-bold">{summary.totalContracts}</div>
          <div className="text-xs text-muted-foreground">Contracts</div>
        </div>
      </div>
      <div className="flex items-center gap-3 rounded-lg border bg-card p-3 shadow-sm">
        <div className="rounded-full bg-orange-500/10 p-2 text-orange-600">
          <CalendarIcon className="h-4 w-4" />
        </div>
        <div>
          <div className="text-2xl font-bold">{summary.shiftsToday}</div>
          <div className="text-xs text-muted-foreground">Shifts Today</div>
        </div>
      </div>
      <div className="flex items-center gap-3 rounded-lg border bg-card p-3 shadow-sm">
        <div className="rounded-full bg-purple-500/10 p-2 text-purple-600">
          <CheckCircleIcon className="h-4 w-4" />
        </div>
        <div>
          <div className="text-2xl font-bold">{summary.shiftsThisWeek}</div>
          <div className="text-xs text-muted-foreground">Shifts This Week</div>
        </div>
      </div>
    </div>
  );
}
