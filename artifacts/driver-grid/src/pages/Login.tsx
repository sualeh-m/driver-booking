import { useListUsers, useLogin } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { LogInIcon, UserIcon } from "lucide-react";

export function Login() {
  const [, setLocation] = useLocation();
  const { data: users, isLoading } = useListUsers();
  const login = useLogin();

  const handleLogin = (userId: number) => {
    login.mutate(
      { data: { userId } },
      {
        onSuccess: () => {
          setLocation("/");
        },
      }
    );
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-md space-y-8">
        <div className="flex flex-col items-center space-y-2 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-md">
            <LogInIcon className="h-6 w-6" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">ShiftControl</h1>
          <p className="text-muted-foreground">Select your account to continue</p>
        </div>

        <Card className="border-muted shadow-lg">
          <CardHeader className="pb-4">
            <CardTitle>Account Managers</CardTitle>
            <CardDescription>Internal access only</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2">
            {isLoading ? (
              <>
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-14 w-full" />
              </>
            ) : users?.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">
                No users found in the system.
              </div>
            ) : (
              users?.map((user) => (
                <Button
                  key={user.id}
                  variant="outline"
                  className="h-auto justify-start gap-4 p-4 text-left font-normal transition-all hover:border-primary hover:bg-primary/5"
                  onClick={() => handleLogin(user.id)}
                  disabled={login.isPending}
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
                    <UserIcon className="h-5 w-5" />
                  </div>
                  <div className="flex flex-col items-start gap-1">
                    <span className="font-semibold">{user.name}</span>
                    <span className="text-xs text-muted-foreground">{user.email}</span>
                  </div>
                </Button>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
