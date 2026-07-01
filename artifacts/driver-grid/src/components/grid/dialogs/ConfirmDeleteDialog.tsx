import { useEffect, useState, type ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const CONFIRM_WORD = "DELETE";

// Shared confirmation dialog for permanent, admin-only deletes. It forces the
// user to type DELETE exactly (no trimming, so "DELETE " does NOT count) before
// the destructive button enables, and shows an impact block spelling out exactly
// what will be removed. The typed text resets every time the dialog opens so a
// previous attempt never leaks its confirmation into a new one.
export function ConfirmDeleteDialog({
  open,
  onOpenChange,
  title,
  description,
  impact,
  confirmLabel = "Delete",
  pending = false,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description?: ReactNode;
  /** What will be removed — shown in a highlighted block above the input. */
  impact?: ReactNode;
  confirmLabel?: string;
  pending?: boolean;
  onConfirm: () => void;
}) {
  const [confirmText, setConfirmText] = useState("");

  useEffect(() => {
    if (open) setConfirmText("");
  }, [open]);

  const confirmed = confirmText === CONFIRM_WORD;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-destructive">{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        <div className="space-y-3 pt-1">
          {impact && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {impact}
            </div>
          )}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">
              Type {CONFIRM_WORD} to confirm
            </label>
            <Input
              autoFocus
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={CONFIRM_WORD}
              onKeyDown={(e) => {
                if (e.key === "Enter" && confirmed && !pending) onConfirm();
              }}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={!confirmed || pending}
            onClick={onConfirm}
          >
            {pending ? "Deleting…" : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
