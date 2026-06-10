import { ReactNode, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useGetCurrentUser, useLogout, getGetCurrentUserQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { ActivityIcon, CalendarDaysIcon, LogOutIcon } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export function Shell({ children }: { children: ReactNode }) {
  const [location, setLocation] = useLocation();
  const { data: user, isLoading, isError } = useGetCurrentUser({ query: { retry: false, queryKey: getGetCurrentUserQueryKey() } });
  const logout = useLogout();

  useEffect(() => {
    if (!isLoading && (isError || !user)) {
      setLocation("/login");
    }
  }, [isLoading, isError, user, setLocation]);

  if (isLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <Skeleton className="h-12 w-12 rounded-full" />
      </div>
    );
  }

  if (isError || !user) {
    return null;
  }

  const handleLogout = () => {
    logout.mutate(undefined, {
      onSuccess: () => {
        setLocation("/login");
      },
    });
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b bg-card px-4 shadow-xs">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2 font-semibold text-primary">
            <div className="flex h-8 w-8 items-center justify-center rounded bg-primary text-primary-foreground">
              <CalendarDaysIcon className="h-5 w-5" />
            </div>
            <span>ShiftControl</span>
          </div>
          <nav className="flex items-center gap-1">
            <Link href="/">
              <Button
                variant={location === "/" ? "secondary" : "ghost"}
                size="sm"
                className="gap-2"
              >
                <CalendarDaysIcon className="h-4 w-4" />
                Grid
              </Button>
            </Link>
            <Link href="/activity">
              <Button
                variant={location === "/activity" ? "secondary" : "ghost"}
                size="sm"
                className="gap-2"
              >
                <ActivityIcon className="h-4 w-4" />
                Activity
              </Button>
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium text-muted-foreground">
            {user.name}
          </span>
          <Button variant="ghost" size="icon" onClick={handleLogout} title="Logout">
            <LogOutIcon className="h-4 w-4" />
          </Button>
        </div>
      </header>
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
