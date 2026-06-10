import { useListAudit } from "@workspace/api-client-react";
import { format } from "date-fns";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export function Activity() {
  const { data: auditEntries, isLoading } = useListAudit({ limit: 100 });

  return (
    <div className="mx-auto max-w-6xl p-6">
      <Card>
        <CardHeader>
          <CardTitle>Activity Log</CardTitle>
          <CardDescription>Recent changes made across all contracts</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-10 text-muted-foreground">
                    Loading activity...
                  </TableCell>
                </TableRow>
              ) : auditEntries?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-10 text-muted-foreground">
                    No recent activity found.
                  </TableCell>
                </TableRow>
              ) : (
                auditEntries?.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {format(new Date(entry.changedAt), "MMM d, HH:mm")}
                    </TableCell>
                    <TableCell className="font-medium">{entry.userName || "System"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-mono text-xs">
                        {entry.action}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1 text-sm">
                        {entry.driverName && entry.shiftDate && (
                          <span className="font-semibold">
                            {entry.driverName} on {format(new Date(entry.shiftDate), "MMM d, yyyy")}
                          </span>
                        )}
                        {(entry.oldValue || entry.newValue) && (
                          <div className="flex items-center gap-2 text-muted-foreground">
                            {entry.oldValue && <span className="line-through">{entry.oldValue}</span>}
                            {entry.oldValue && entry.newValue && <span>&rarr;</span>}
                            {entry.newValue && <span className="font-medium text-foreground">{entry.newValue}</span>}
                          </div>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
