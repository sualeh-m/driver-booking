import { useState, FormEvent } from "react";
import {
  useListUsers,
  useCreateUser,
  useUpdateUser,
  useDeleteUser,
  useResetUserPassword,
  useGetCurrentUser,
  getListUsersQueryKey,
  getGetCurrentUserQueryKey,
  type User,
  type UserRole,
} from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { UserPlusIcon, KeyRoundIcon, PencilIcon, Trash2Icon } from "lucide-react";

const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Admin",
  standard: "Standard",
};

export function Users() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: currentUser } = useGetCurrentUser({
    query: { queryKey: getGetCurrentUserQueryKey() },
  });
  const { data: users, isLoading } = useListUsers({
    query: { queryKey: getListUsersQueryKey() },
  });

  const createUser = useCreateUser();
  const updateUser = useUpdateUser();
  const deleteUser = useDeleteUser();
  const resetPassword = useResetUserPassword();

  const [createOpen, setCreateOpen] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [resetUser, setResetUser] = useState<User | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });

  // Create form state
  const [cName, setCName] = useState("");
  const [cEmail, setCEmail] = useState("");
  const [cRole, setCRole] = useState<UserRole>("standard");
  const [cTemp, setCTemp] = useState("");
  const [cError, setCError] = useState<string | null>(null);

  const openCreate = () => {
    setCName("");
    setCEmail("");
    setCRole("standard");
    setCTemp("");
    setCError(null);
    setCreateOpen(true);
  };

  const submitCreate = (e: FormEvent) => {
    e.preventDefault();
    setCError(null);
    if (cTemp.length < 8) {
      setCError("Temporary password must be at least 8 characters");
      return;
    }
    createUser.mutate(
      {
        data: {
          name: cName.trim(),
          email: cEmail.trim(),
          role: cRole,
          temporaryPassword: cTemp,
        },
      },
      {
        onSuccess: () => {
          invalidate();
          setCreateOpen(false);
          toast({ title: `${cName.trim()} added` });
        },
        onError: () => setCError("Could not create user. Email may already be in use."),
      }
    );
  };

  // Edit form state
  const [eName, setEName] = useState("");
  const [eEmail, setEEmail] = useState("");
  const [eRole, setERole] = useState<UserRole>("standard");
  const [eError, setEError] = useState<string | null>(null);

  const openEdit = (u: User) => {
    setEName(u.name);
    setEEmail(u.email);
    setERole(u.role);
    setEError(null);
    setEditUser(u);
  };

  const submitEdit = (e: FormEvent) => {
    e.preventDefault();
    if (!editUser) return;
    setEError(null);
    updateUser.mutate(
      {
        userId: editUser.id,
        data: { name: eName.trim(), email: eEmail.trim(), role: eRole },
      },
      {
        onSuccess: () => {
          invalidate();
          queryClient.invalidateQueries({ queryKey: getGetCurrentUserQueryKey() });
          setEditUser(null);
          toast({ title: "User updated" });
        },
        onError: () =>
          setEError("Could not update user. Email may be in use, or this is the last admin."),
      }
    );
  };

  // Reset password state
  const [rTemp, setRTemp] = useState("");
  const [rError, setRError] = useState<string | null>(null);

  const openReset = (u: User) => {
    setRTemp("");
    setRError(null);
    setResetUser(u);
  };

  const submitReset = (e: FormEvent) => {
    e.preventDefault();
    if (!resetUser) return;
    setRError(null);
    if (rTemp.length < 8) {
      setRError("Temporary password must be at least 8 characters");
      return;
    }
    resetPassword.mutate(
      { userId: resetUser.id, data: { temporaryPassword: rTemp } },
      {
        onSuccess: () => {
          setResetUser(null);
          toast({
            title: `Password reset for ${resetUser.name}`,
            description: "They will be required to change it on next sign in.",
          });
        },
        onError: () => setRError("Could not reset password."),
      }
    );
  };

  if (currentUser && currentUser.role !== "admin") {
    return (
      <div className="mx-auto max-w-4xl p-6">
        <Card>
          <CardHeader>
            <CardTitle>Not authorized</CardTitle>
            <CardDescription>
              You need an admin account to manage users.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const confirmDelete = () => {
    if (!deleteTarget) return;
    deleteUser.mutate(
      { userId: deleteTarget.id },
      {
        onSuccess: () => {
          invalidate();
          toast({ title: `${deleteTarget.name} deleted` });
          setDeleteTarget(null);
        },
        onError: () => {
          toast({
            title: "Could not delete user",
            description: "You cannot delete yourself or the last admin.",
            variant: "destructive",
          });
          setDeleteTarget(null);
        },
      }
    );
  };

  return (
    <div className="mx-auto max-w-4xl p-6">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>Users</CardTitle>
            <CardDescription>
              Manage who can sign in. New users and password resets get a temporary password and
              must set their own on next sign in.
            </CardDescription>
          </div>
          <Button onClick={openCreate} className="gap-2">
            <UserPlusIcon className="h-4 w-4" />
            Add user
          </Button>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                    Loading...
                  </TableCell>
                </TableRow>
              ) : !users?.length ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                    No users found.
                  </TableCell>
                </TableRow>
              ) : (
                users.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">
                      {u.name}
                      {currentUser?.id === u.id && (
                        <span className="ml-2 text-xs text-muted-foreground">(you)</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{u.email}</TableCell>
                    <TableCell>
                      <Badge variant={u.role === "admin" ? "default" : "secondary"}>
                        {ROLE_LABELS[u.role]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {u.mustChangePassword ? "Must change password" : "Active"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="gap-1"
                          onClick={() => openEdit(u)}
                        >
                          <PencilIcon className="h-3.5 w-3.5" />
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="gap-1"
                          onClick={() => openReset(u)}
                        >
                          <KeyRoundIcon className="h-3.5 w-3.5" />
                          Reset
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="gap-1 text-destructive hover:text-destructive"
                          onClick={() => setDeleteTarget(u)}
                          disabled={currentUser?.id === u.id}
                        >
                          <Trash2Icon className="h-3.5 w-3.5" />
                          Delete
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <form onSubmit={submitCreate}>
            <DialogHeader>
              <DialogTitle>Add user</DialogTitle>
              <DialogDescription>
                Set a temporary password. They will choose their own on first sign in.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="c-name">Full name</Label>
                <Input id="c-name" value={cName} onChange={(e) => setCName(e.target.value)} required />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="c-email">Email</Label>
                <Input
                  id="c-email"
                  type="email"
                  value={cEmail}
                  onChange={(e) => setCEmail(e.target.value)}
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="c-role">Role</Label>
                <Select value={cRole} onValueChange={(v) => setCRole(v as UserRole)}>
                  <SelectTrigger id="c-role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="standard">Standard</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="c-temp">Temporary password</Label>
                <Input
                  id="c-temp"
                  value={cTemp}
                  onChange={(e) => setCTemp(e.target.value)}
                  placeholder="At least 8 characters"
                  required
                />
              </div>
              {cError && <p className="text-sm font-medium text-destructive">{cError}</p>}
            </div>
            <DialogFooter>
              <Button type="submit" disabled={createUser.isPending}>
                {createUser.isPending ? "Adding..." : "Add user"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={editUser != null} onOpenChange={(o) => !o && setEditUser(null)}>
        <DialogContent>
          <form onSubmit={submitEdit}>
            <DialogHeader>
              <DialogTitle>Edit user</DialogTitle>
              <DialogDescription>Update name, email, or role.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="e-name">Full name</Label>
                <Input id="e-name" value={eName} onChange={(e) => setEName(e.target.value)} required />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="e-email">Email</Label>
                <Input
                  id="e-email"
                  type="email"
                  value={eEmail}
                  onChange={(e) => setEEmail(e.target.value)}
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="e-role">Role</Label>
                <Select value={eRole} onValueChange={(v) => setERole(v as UserRole)}>
                  <SelectTrigger id="e-role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="standard">Standard</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {eError && <p className="text-sm font-medium text-destructive">{eError}</p>}
            </div>
            <DialogFooter>
              <Button type="submit" disabled={updateUser.isPending}>
                {updateUser.isPending ? "Saving..." : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Reset password dialog */}
      <Dialog open={resetUser != null} onOpenChange={(o) => !o && setResetUser(null)}>
        <DialogContent>
          <form onSubmit={submitReset}>
            <DialogHeader>
              <DialogTitle>Reset password</DialogTitle>
              <DialogDescription>
                Set a temporary password for {resetUser?.name}. They must change it on next sign in.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="r-temp">Temporary password</Label>
                <Input
                  id="r-temp"
                  value={rTemp}
                  onChange={(e) => setRTemp(e.target.value)}
                  placeholder="At least 8 characters"
                  required
                />
              </div>
              {rError && <p className="text-sm font-medium text-destructive">{rError}</p>}
            </div>
            <DialogFooter>
              <Button type="submit" disabled={resetPassword.isPending}>
                {resetPassword.isPending ? "Resetting..." : "Reset password"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={deleteTarget != null} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes their sign-in access. Their past activity stays in the audit trail but is
              no longer attributed to a named user. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
