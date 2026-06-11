import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
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
  getListSheetContactsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

export function SheetSettingsDialog({ open, onOpenChange, sheet }: { open: boolean, onOpenChange: (o: boolean) => void, sheet: Sheet }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

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
        </div>

        <div className="flex justify-end pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
