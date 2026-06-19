import { useState } from "react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import { DownloadIcon, MailIcon, MessageSquareIcon, UserPlusIcon, SettingsIcon, FilePlusIcon } from "lucide-react";
import type { Sheet, Booking, GridWorker } from "@workspace/api-client-react";
import { AddWorkerDialog } from "./dialogs/AddWorkerDialog";
import { NewSheetDialog } from "./dialogs/NewSheetDialog";
import { SheetSettingsDialog } from "./dialogs/SheetSettingsDialog";
import { EmailClientDialog } from "./dialogs/EmailClientDialog";
import { SendConfirmationsDialog } from "./dialogs/SendConfirmationsDialog";

interface GridToolbarProps {
  sheet: Sheet | null;
  start: Date;
  end: Date;
  bookings?: Booking[];
  workers?: GridWorker[];
  onSheetDeleted?: () => void;
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

export function GridToolbar({ sheet, start, end, bookings, workers, onSheetDeleted }: GridToolbarProps) {
  const [addWorkerOpen, setAddWorkerOpen] = useState(false);
  const [newSheetOpen, setNewSheetOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [emailClientOpen, setEmailClientOpen] = useState(false);
  const [sendConfirmationsOpen, setSendConfirmationsOpen] = useState(false);

  const startStr = format(start, "yyyy-MM-dd");
  const endStr = format(end, "yyyy-MM-dd");

  const actions = [
    { key: "add", label: "Add Worker", Icon: UserPlusIcon, onClick: () => setAddWorkerOpen(true), disabled: !sheet },
    { key: "new", label: "New Sheet", Icon: FilePlusIcon, onClick: () => setNewSheetOpen(true), disabled: false },
    { key: "settings", label: "Sheet Settings", Icon: SettingsIcon, onClick: () => setSettingsOpen(true), disabled: !sheet },
    {
      key: "export",
      label: "Export",
      Icon: DownloadIcon,
      onClick: () => {
        if (sheet && bookings && workers) exportCsv(sheet, workers, bookings);
      },
      disabled: !sheet || !bookings || !workers,
    },
    { key: "email", label: "Email Client", Icon: MailIcon, onClick: () => setEmailClientOpen(true), disabled: !sheet },
    { key: "confirm", label: "Confirmations", Icon: MessageSquareIcon, onClick: () => setSendConfirmationsOpen(true), disabled: !sheet },
  ] as const;

  return (
    <>
      <TooltipProvider delayDuration={200}>
        <div className="flex flex-nowrap items-center gap-1">
          {actions.map(({ key, label, Icon, onClick, disabled }) => (
            <Tooltip key={key}>
              <TooltipTrigger asChild>
                <Button variant="outline" size="icon" onClick={onClick} disabled={disabled} aria-label={label}>
                  <Icon className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{label}</TooltipContent>
            </Tooltip>
          ))}
        </div>
      </TooltipProvider>

      <AddWorkerDialog open={addWorkerOpen} onOpenChange={setAddWorkerOpen} sheet={sheet} start={startStr} end={endStr} />
      <NewSheetDialog open={newSheetOpen} onOpenChange={setNewSheetOpen} />
      {sheet && <SheetSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} sheet={sheet} onDeleted={onSheetDeleted} />}
      <EmailClientDialog open={emailClientOpen} onOpenChange={setEmailClientOpen} sheetId={sheet?.id ?? null} />
      <SendConfirmationsDialog open={sendConfirmationsOpen} onOpenChange={setSendConfirmationsOpen} sheetId={sheet?.id ?? null} workers={workers} />
    </>
  );
}
