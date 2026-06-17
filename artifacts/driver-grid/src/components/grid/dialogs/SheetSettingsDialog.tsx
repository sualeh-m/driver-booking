import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StarIcon, TrashIcon } from "lucide-react";
import type { Sheet } from "@workspace/api-client-react";
import {
  useListSheetContacts,
  useAddSheetContact,
  useUpdateSheetContact,
  useRemoveSheetContact,
  useDeleteSheet,
  useGetCurrentUser,
  getListSheetContactsQueryKey,
  getListSheetsQueryKey,
  getGetCurrentUserQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

export function SheetSettingsDialog({ open, onOpenChange, sheet, onDeleted }: { open: boolean, onOpenChange: (o: boolean) => void, sheet: Sheet, onDeleted?: () => void }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const { data: currentUser } = useGetCurrentUser({
    query: { retry: false, queryKey: getGetCurrentUserQueryKey() },
  });
  const isAdmin = currentUser?.role === "admin";
  const deleteSheet = useDeleteSheet();

  const handleDeleteSheet = () => {
    deleteSheet.mutate(
      { sheetId: sheet.id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListSheetsQueryKey() });
          setConfirmDelete(false);
          onOpenChange(false);
          onDeleted?.();
          toast({ title: `Sheet "${sheet.name}" deleted` });
        },
        onError: () => toast({ title: "Could not delete sheet", variant: "destructive" }),
      },
    );
  };

  const { data: contacts, isLoading } = useListSheetContacts(sheet.id, {
    query: { enabled: open, queryKey: getListSheetContactsQueryKey(sheet.id) },
  });
  const addContact = useAddSheetContact();
  const updateContact = useUpdateSheetContact();
  const removeContact = useRemoveSheetContact();

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: getListSheetContactsQueryKey(sheet.id) });

  const handleAdd = () => {
    if (!email.trim()) {
      toast({ title: "Email is required", variant: "destructive" });
      return;
    }
    addContact.mutate(
      { sheetId: sheet.id, data: { contactName: name.trim() || undefined, email: email.trim() } },
      {
        onSuccess: () => {
          invalidate();
          setName("");
          setEmail("");
        },
        onError: () => toast({ title: "Failed to add contact", variant: "destructive" }),
      },
    );
  };

  const handleSetPrimary = (contactId: number) => {
    updateContact.mutate(
      { sheetId: sheet.id, contactId, data: { isPrimary: true } },
      { onSuccess: invalidate },
    );
  };

  const handleRemove = (contactId: number) => {
    removeContact.mutate({ sheetId: sheet.id, contactId }, { onSuccess: invalidate });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Sheet Settings — {sheet.name}</DialogTitle>
          <DialogDescription>
            {sheet.clientCompany}{sheet.depot ? ` · ${sheet.depot}` : ""} · {sheet.workerType}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div>
            <h4 className="text-sm font-semibold mb-2">Client Contacts</h4>
            {isLoading ? (
              <div className="text-sm text-muted-foreground py-4">Loading contacts...</div>
            ) : contacts && contacts.length > 0 ? (
              <div className="space-y-2">
                {contacts.map((c) => (
                  <div key={c.id} className="flex items-center justify-between rounded-md border p-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium truncate">{c.contactName || "(no name)"}</span>
                        {c.isPrimary && <Badge variant="secondary" className="text-xs">Primary</Badge>}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">{c.email}</div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {!c.isPrimary && (
                        <Button variant="ghost" size="icon" title="Make primary" onClick={() => handleSetPrimary(c.id)}>
                          <StarIcon className="h-4 w-4" />
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" title="Remove" className="text-destructive hover:text-destructive" onClick={() => handleRemove(c.id)}>
                        <TrashIcon className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground py-2">No contacts yet. Add one below.</div>
            )}
          </div>

          <div className="space-y-2 border-t pt-3">
            <h4 className="text-sm font-semibold">Add Contact</h4>
            <div className="grid grid-cols-2 gap-2">
              <Input placeholder="Contact name" value={name} onChange={(e) => setName(e.target.value)} />
              <Input placeholder="email@client.co.uk" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <Button size="sm" onClick={handleAdd} disabled={addContact.isPending}>
              {addContact.isPending ? "Adding..." : "Add Contact"}
            </Button>
            <p className="text-xs text-muted-foreground">The primary contact receives the client email.</p>
          </div>

          {isAdmin && (
            <div className="space-y-2 border-t border-destructive/30 pt-3">
              <h4 className="text-sm font-semibold text-destructive">Danger Zone</h4>
              <p className="text-xs text-muted-foreground">
                Permanently delete this sheet and all of its bookings. This cannot be undone.
              </p>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setConfirmDelete(true)}
                disabled={deleteSheet.isPending}
              >
                <TrashIcon className="mr-2 h-4 w-4" />
                Delete Sheet
              </Button>
            </div>
          )}
        </div>

        <div className="flex justify-end pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
        </div>

        <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete sheet "{sheet.name}"?</AlertDialogTitle>
              <AlertDialogDescription>
                This permanently deletes the sheet and every booking on it. Workers, leavers and
                their event history are kept. This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={handleDeleteSheet}
                disabled={deleteSheet.isPending}
              >
                {deleteSheet.isPending ? "Deleting..." : "Delete sheet"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}
