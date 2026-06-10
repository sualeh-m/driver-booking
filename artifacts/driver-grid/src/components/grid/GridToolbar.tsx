import { useState } from "react";
import { Button } from "@/components/ui/button";
import { PlusIcon, DownloadIcon, MailIcon, MessageSquareIcon, UploadIcon, UserPlusIcon } from "lucide-react";
import { AddDriverDialog } from "./dialogs/AddDriverDialog";
import { NewContractDialog } from "./dialogs/NewContractDialog";
import { ImportCsvDialog } from "./dialogs/ImportCsvDialog";
import { EmailClientDialog } from "./dialogs/EmailClientDialog";
import { SendConfirmationsDialog } from "./dialogs/SendConfirmationsDialog";

export function GridToolbar({ contractId }: { contractId: number | null }) {
  const [addDriverOpen, setAddDriverOpen] = useState(false);
  const [newContractOpen, setNewContractOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [emailClientOpen, setEmailClientOpen] = useState(false);
  const [sendConfirmationsOpen, setSendConfirmationsOpen] = useState(false);

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => setAddDriverOpen(true)}>
          <UserPlusIcon className="mr-2 h-4 w-4" />
          Add Driver
        </Button>
        <Button variant="outline" size="sm" onClick={() => setNewContractOpen(true)}>
          <PlusIcon className="mr-2 h-4 w-4" />
          New Contract
        </Button>
        <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
          <UploadIcon className="mr-2 h-4 w-4" />
          Import CSV
        </Button>
        <Button variant="outline" size="sm">
          <DownloadIcon className="mr-2 h-4 w-4" />
          Export
        </Button>
        <Button variant="outline" size="sm" onClick={() => setEmailClientOpen(true)} disabled={!contractId}>
          <MailIcon className="mr-2 h-4 w-4" />
          Email Client
        </Button>
        <Button variant="outline" size="sm" onClick={() => setSendConfirmationsOpen(true)} disabled={!contractId}>
          <MessageSquareIcon className="mr-2 h-4 w-4" />
          Confirmations
        </Button>
      </div>

      <AddDriverDialog open={addDriverOpen} onOpenChange={setAddDriverOpen} contractId={contractId} />
      <NewContractDialog open={newContractOpen} onOpenChange={setNewContractOpen} />
      <ImportCsvDialog open={importOpen} onOpenChange={setImportOpen} contractId={contractId} />
      <EmailClientDialog open={emailClientOpen} onOpenChange={setEmailClientOpen} contractId={contractId} />
      <SendConfirmationsDialog open={sendConfirmationsOpen} onOpenChange={setSendConfirmationsOpen} contractId={contractId} />
    </>
  );
}
