import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircleIcon, CheckCircleIcon } from "lucide-react";
import type { Sheet } from "@workspace/api-client-react";
import {
  useImportBookings,
  getGetGridQueryKey,
  getGetDashboardSummaryQueryKey,
  getListAuditQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

const SAMPLE = "full_name,phone,job_role,shift_date,status,start_time\nTom Bradley,07700 900001,Class 1 HGV,2026-06-08,Confirmed,06:00";

export function ImportCsvDialog({ open, onOpenChange, sheet, start, end }: { open: boolean, onOpenChange: (o: boolean) => void, sheet: Sheet | null, start: string, end: string }) {
  const queryClient = useQueryClient();
  const [csvText, setCsvText] = useState("");
  const importBookings = useImportBookings();

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    file.text().then(setCsvText);
  };

  const handleImport = () => {
    if (!sheet || !csvText.trim()) return;
    importBookings.mutate(
      { data: { sheetId: sheet.id, csvText } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetGridQueryKey({ sheetId: sheet.id, start, end }) });
          queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
          queryClient.invalidateQueries({ queryKey: getListAuditQueryKey({}) });
        },
      },
    );
  };

  const result = importBookings.data;

  return (
    <Dialog open={open} onOpenChange={(o) => {
      onOpenChange(o);
      if (!o) { setCsvText(""); importBookings.reset(); }
    }}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import CSV</DialogTitle>
          <DialogDescription>
            {sheet ? `Import workers and bookings into ${sheet.name}.` : "Select a sheet first."}
          </DialogDescription>
        </DialogHeader>

        <Alert>
          <AlertCircleIcon className="h-4 w-4" />
          <AlertTitle>Expected columns</AlertTitle>
          <AlertDescription className="font-mono text-xs">
            full_name, phone, job_role, shift_date (YYYY-MM-DD), status, start_time
          </AlertDescription>
        </Alert>

        <div className="space-y-3 pt-1">
          <input type="file" accept=".csv,text/csv" onChange={handleFile} className="text-sm" />
          <Textarea
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
            placeholder={SAMPLE}
            rows={8}
            className="font-mono text-xs"
          />

          {result && (
            <Alert className="border-green-500/30 bg-green-500/5">
              <CheckCircleIcon className="h-4 w-4 text-green-600" />
              <AlertTitle>Import complete</AlertTitle>
              <AlertDescription className="text-xs">
                {result.workersCreated} workers created, {result.workersMatched} matched, {result.bookingsUpserted} bookings saved.
                {result.errors.length > 0 && (
                  <ul className="mt-2 list-disc pl-4 text-destructive">
                    {result.errors.slice(0, 10).map((err, i) => <li key={i}>{err}</li>)}
                  </ul>
                )}
              </AlertDescription>
            </Alert>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          <Button onClick={handleImport} disabled={!sheet || !csvText.trim() || importBookings.isPending}>
            {importBookings.isPending ? "Importing..." : "Import"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
