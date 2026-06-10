import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function ImportCsvDialog({ open, onOpenChange, contractId }: { open: boolean, onOpenChange: (o: boolean) => void, contractId: number | null }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import CSV</DialogTitle>
        </DialogHeader>
        <div className="py-4 text-sm text-muted-foreground">
          {/* TODO: CSV import workflow */}
          Work in progress
        </div>
      </DialogContent>
    </Dialog>
  );
}
