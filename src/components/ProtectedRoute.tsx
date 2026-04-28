import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Music } from 'lucide-react';

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4 animate-in fade-in duration-500">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
            <Music className="h-6 w-6 text-primary animate-pulse" />
          </div>
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  return <>{children}</>;
}
