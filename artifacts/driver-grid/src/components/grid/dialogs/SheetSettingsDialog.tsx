import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ConfirmDeleteDialog } from "./ConfirmDeleteDialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StarIcon, TrashIcon } from "lucide-react";
import type { Sheet, SheetWorkerType } from "@workspace/api-client-react";
import {
  useListSheetContacts,
  useAddSheetContact,
  useUpdateSheetContact,
  useRemoveSheetContact,
  useUpdateSheet,
  useDeleteSheet,
  useGetSheetDeleteImpact,
  useGetCurrentUser,
  getListSheetContactsQueryKey,
  getListSheetsQueryKey,
  getGetSheetDeleteImpactQueryKey,
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

  // Sheet details (client, depot, worker type). Re-seeded from the sheet each
  // time the dialog opens or the sheet changes so stale edits never leak.
  const [clientCompany, setClientCompany] = useState(sheet.clientCompany);
  const [depot, setDepot] = useState(sheet.depot ?? "");
  const [workerType, setWorkerType] = useState<SheetWorkerType>(sheet.workerType);
  useEffect(() => {
    if (open) {
      setClientCompany(sheet.clientCompany);
      setDepot(sheet.depot ?? "");
      setWorkerType(sheet.workerType);
    }
  }, [open, sheet.id, sheet.clientCompany, sheet.depot, sheet.workerType]);

  const updateSheet = useUpdateSheet();
  const detailsDirty =
    clientCompany.trim() !== sheet.clientCompany ||
    (depot.trim() || "") !== (sheet.depot ?? "") ||
    workerType !== sheet.workerType;

  const handleSaveDetails = () => {
    if (!clientCompany.trim()) {
      toast({ title: "Client name is required", variant: "destructive" });
      return;
    }
    updateSheet.mutate(
      {
        sheetId: sheet.id,
        data: { clientCompany: clientCompany.trim(), depot: depot.trim(), workerType },
      },
      {
        onSuccess: (updated) => {
          queryClient.invalidateQueries({ queryKey: getListSheetsQueryKey() });
          toast({ title: `Sheet updated`, description: `${updated.name} · ${updated.workerType}` });
        },
        onError: () => toast({ title: "Could not update sheet", variant: "destructive" }),
      },
    );
  };

  const { data: currentUser } = useGetCurrentUser({
    query: { retry: false, queryKey: getGetCurrentUserQueryKey() },
  });
  const isAdmin = currentUser?.role === "admin";
  const deleteSheet = useDeleteSheet();
  const { data: impact } = useGetSheetDeleteImpact(sheet.id, {
    query: {
      enabled: confirmDelete && isAdmin,
      queryKey: getGetSheetDeleteImpactQueryKey(sheet.id),
    },
  });

  const handleDeleteSheet = () => {
    deleteSheet.mutate(
      { sheetId: sheet.id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListSheetsQueryKey() });
          queryClient.invalidateQueries({ queryKey: ["/api/reports/operational"] });
          queryClient.invalidateQueries({ queryKey: ["/api/reports/people"] });
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
          <div className="space-y-2">
            <h4 className="text-sm font-semibold">Sheet Details</h4>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Client name</label>
                <Input
                  value={clientCompany}
                  onChange={(e) => setClientCompany(e.target.value)}
                  placeholder="Client company"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Depot</label>
                <Input
                  value={depot}
                  onChange={(e) => setDepot(e.target.value)}
                  placeholder="Depot"
                />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Worker type</label>
              {sheet.workerType === "Both" ? (
                <div className="flex h-9 items-center rounded-md border bg-muted/50 px-3 text-sm text-muted-foreground">
                  Both — covers HGV and Warehouse (cannot be narrowed)
                </div>
              ) : (
                <>
                  <Select
                    value={workerType}
                    onValueChange={(v) => setWorkerType(v as SheetWorkerType)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={sheet.workerType}>{sheet.workerType}</SelectItem>
                      <SelectItem value="Both">Both</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    A sheet's worker type can only be widened to "Both" — it can't be
                    narrowed back afterwards.
                  </p>
                </>
              )}
            </div>
            <Button
              size="sm"
              onClick={handleSaveDetails}
              disabled={!detailsDirty || updateSheet.isPending}
            >
              {updateSheet.isPending ? "Saving..." : "Save Details"}
            </Button>
          </div>

          <div className="border-t pt-3">
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

        <ConfirmDeleteDialog
          open={confirmDelete}
          onOpenChange={setConfirmDelete}
          title={`Delete sheet "${sheet.name}"?`}
          description="This permanently deletes the sheet and everything scoped to it."
          impact={
            <>
              Deleting this sheet also removes:
              <ul className="mt-1 list-disc pl-5">
                <li>{impact?.bookings ?? 0} booking{(impact?.bookings ?? 0) === 1 ? "" : "s"}</li>
                <li>{impact?.workers ?? 0} worker link{(impact?.workers ?? 0) === 1 ? "" : "s"} to this sheet</li>
                <li>{impact?.contacts ?? 0} client contact{(impact?.contacts ?? 0) === 1 ? "" : "s"}</li>
                <li>{impact?.requirements ?? 0} shift requirement{(impact?.requirements ?? 0) === 1 ? "" : "s"}</li>
              </ul>
              {(impact?.submissions ?? 0) > 0 && (
                <div className="mt-1">
                  {impact?.submissions} submission{impact?.submissions === 1 ? "" : "s"} will be
                  unlinked from this sheet (the submissions themselves are kept).
                </div>
              )}
              <div className="mt-1">
                Workers, leavers and their event history are kept. This cannot be undone.
              </div>
            </>
          }
          confirmLabel="Delete sheet"
          pending={deleteSheet.isPending}
          onConfirm={handleDeleteSheet}
        />
      </DialogContent>
    </Dialog>
  );
}
