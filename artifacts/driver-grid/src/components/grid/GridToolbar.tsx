import { useState } from "react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { PlusIcon, DownloadIcon, MailIcon, MessageSquareIcon, UploadIcon, UserPlusIcon, SettingsIcon } from "lucide-react";
import type { Sheet, Booking, GridWorker } from "@workspace/api-client-react";
import { AddWorkerDialog } from "./dialogs/AddWorkerDialog";
import { NewSheetDialog } from "./dialogs/NewSheetDialog";
import { SheetSettingsDialog } from "./dialogs/SheetSettingsDialog";
import { ImportCsvDialog } from "./dialogs/ImportCsvDialog";
import { EmailClientDialog } from "./dialogs/EmailClientDialog";
import { SendConfirmationsDialog } from "./dialogs/SendConfirmationsDialog";

interface GridToolbarProps {
  sheet: Sheet | null;
  start: Date;
  end: Date;
  bookings?: Booking[];
  workers?: GridWorker[];
}

function exportCsv(sheet: Sheet, workers: GridWorker[], bookings: Booking[]) {
  const byWorker = new Map<number, GridWorker>();
  workers.forEach((w) => byWorker.set(w.id, w));

  const header = ["full_name", "phone", "job_role", "shift_date", "status", "start_time"];
  const lines = [header.join(",")];

  for (const b of bookings) {
    const w = byWorker.get(b.workerId);
    if (!w) continue;
    const cells = [
      w.fullName,
      w.phone ?? "",
      w.jobRole ?? "",
      b.shiftDate,
      b.status,
      b.startTime ?? "",
    ].map((c) => {
      const s = String(c);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    });
    lines.push(cells.join(","));
  }

  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${sheet.name.replace(/\s+/g, "_")}_bookings.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function GridToolbar({ sheet, start, end, bookings, workers }: GridToolbarProps) {
  const [addWorkerOpen, setAddWorkerOpen] = useState(false);
  const [newSheetOpen, setNewSheetOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [emailClientOpen, setEmailClientOpen] = useState(false);
  const [sendConfirmationsOpen, setSendConfirmationsOpen] = useState(false);

  const startStr = format(start, "yyyy-MM-dd");
  const endStr = format(end, "yyyy-MM-dd");

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => setAddWorkerOpen(true)} disabled={!sheet}>
          <UserPlusIcon className="mr-2 h-4 w-4" />
          Add Worker
        </Button>
        <Button variant="outline" size="sm" onClick={() => setNewSheetOpen(true)}>
          <PlusIcon className="mr-2 h-4 w-4" />
          New Sheet
        </Button>
        <Button variant="outline" size="sm" onClick={() => setSettingsOpen(true)} disabled={!sheet}>
          <SettingsIcon className="mr-2 h-4 w-4" />
          Sheet Settings
        </Button>
        <Button variant="outline" size="sm" onClick={() => setImportOpen(true)} disabled={!sheet}>
          <UploadIcon className="mr-2 h-4 w-4" />
          Import CSV
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={!sheet || !bookings || !workers}
          onClick={() => {
            if (sheet && bookings && workers) exportCsv(sheet, workers, bookings);
          }}
        >
          <DownloadIcon className="mr-2 h-4 w-4" />
          Export
        </Button>
        <Button variant="outline" size="sm" onClick={() => setEmailClientOpen(true)} disabled={!sheet}>
          <MailIcon className="mr-2 h-4 w-4" />
          Email Client
        </Button>
        <Button variant="outline" size="sm" onClick={() => setSendConfirmationsOpen(true)} disabled={!sheet}>
          <MessageSquareIcon className="mr-2 h-4 w-4" />
          Confirmations
        </Button>
      </div>

      <AddWorkerDialog open={addWorkerOpen} onOpenChange={setAddWorkerOpen} sheet={sheet} start={startStr} end={endStr} />
      <NewSheetDialog open={newSheetOpen} onOpenChange={setNewSheetOpen} />
      {sheet && <SheetSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} sheet={sheet} />}
      <ImportCsvDialog open={importOpen} onOpenChange={setImportOpen} sheet={sheet} start={startStr} end={endStr} />
      <EmailClientDialog open={emailClientOpen} onOpenChange={setEmailClientOpen} sheetId={sheet?.id ?? null} />
      <SendConfirmationsDialog open={sendConfirmationsOpen} onOpenChange={setSendConfirmationsOpen} sheetId={sheet?.id ?? null} workers={workers} />
    </>
  );
}
