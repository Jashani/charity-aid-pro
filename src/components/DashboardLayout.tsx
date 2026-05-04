import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { LogOut, User } from "lucide-react";
import { useNavigate } from "react-router-dom";

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const isConfigured = true;

  const handleSignOut = async () => {
    await signOut();
    navigate("/auth");
  };

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 flex items-center border-b border-border/60 bg-card/60 backdrop-blur-md px-4 gap-4 shrink-0 sticky top-0 z-10">
            <SidebarTrigger />
            <span className="text-sm font-medium text-muted-foreground tracking-wide">
              Music for Wellbeing
            </span>

            {/* User info & sign out — right side */}
            {isConfigured && user && (
              <div className="ml-auto flex items-center gap-2">
                <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-1.5">
                  <User className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs font-medium text-muted-foreground truncate max-w-[160px]">
                    {user.email}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-lg text-muted-foreground hover:text-destructive"
                  onClick={handleSignOut}
                  title="Sign out"
                >
                  <LogOut className="h-4 w-4" />
                </Button>
              </div>
            )}
          </header>
          <main className="flex-1 overflow-auto p-6 lg:p-8">{children}</main>
        </div>
      </div>
    </SidebarProvider>
  );
}
