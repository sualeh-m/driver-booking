import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useCreateSheet, getListSheetsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

const formSchema = z.object({
  clientCompany: z.string().min(1, "Client company is required"),
  depot: z.string().optional(),
});

export function NewSheetDialog({ open, onOpenChange }: { open: boolean, onOpenChange: (o: boolean) => void }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const createSheet = useCreateSheet();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      clientCompany: "",
      depot: "",
    },
  });

  function onSubmit(values: z.infer<typeof formSchema>) {
    createSheet.mutate({ data: {
      clientCompany: values.clientCompany,
      depot: values.depot || undefined,
    } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListSheetsQueryKey() });
        toast({ title: "Sheet created successfully" });
        onOpenChange(false);
        form.reset();
      },
      onError: () => {
        toast({ title: "Failed to create sheet", variant: "destructive" });
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => {
      onOpenChange(o);
      if (!o) form.reset();
    }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Sheet</DialogTitle>
          <DialogDescription>Create a booking sheet for a client depot. The sheet name is generated automatically as "Client — Depot".</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-2">
            <FormField
              control={form.control}
              name="clientCompany"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Client Company *</FormLabel>
                  <FormControl>
                    <Input placeholder="Acme Logistics" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="depot"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Depot</FormLabel>
                  <FormControl>
                    <Input placeholder="Daventry" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" disabled={createSheet.isPending}>
                {createSheet.isPending ? "Creating..." : "Create Sheet"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
