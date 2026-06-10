import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function AddDriverDialog({ open, onOpenChange, contractId }: { open: boolean, onOpenChange: (o: boolean) => void, contractId: number | null }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Driver</DialogTitle>
        </DialogHeader>
        <div className="py-4 text-sm text-muted-foreground">
          {/* TODO: Add driver search / creation form */}
          Work in progress
        </div>
      </DialogContent>
    </Dialog>
  );
}
