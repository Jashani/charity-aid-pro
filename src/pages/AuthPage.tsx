import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Music, Mail, Lock, Loader2, AlertCircle, ArrowRight } from 'lucide-react';

type AuthMode = 'sign-in' | 'sign-up';

const AuthPage = () => {
  const { user, signIn, signUp } = useAuth();
  const [mode, setMode] = useState<AuthMode>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // If already logged in, redirect to dashboard
  if (user) {
    return <Navigate to="/" replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!email || !password) {
      setError('Please fill in all fields.');
      return;
    }

    if (mode === 'sign-up' && password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    setLoading(true);

    try {
      if (mode === 'sign-up') {
        const { error } = await signUp(email, password);
        if (error) {
          setError(error.message);
        } else {
          setSuccess('Account created! Check your email to confirm, then sign in.');
          setMode('sign-in');
          setPassword('');
          setConfirmPassword('');
        }
      } else {
        const { error } = await signIn(email, password);
        if (error) {
          setError(error.message);
        }
      }
    } catch {
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const toggleMode = () => {
    setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in');
    setError(null);
    setSuccess(null);
    setPassword('');
    setConfirmPassword('');
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden bg-background">
      {/* Background decorative elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-[40%] -right-[20%] w-[70%] h-[70%] rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute -bottom-[30%] -left-[20%] w-[60%] h-[60%] rounded-full bg-secondary/5 blur-3xl" />
        <div className="absolute top-[20%] left-[10%] w-[30%] h-[30%] rounded-full bg-accent/5 blur-3xl" />
      </div>

      <div className="w-full max-w-[420px] relative z-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
        {/* Logo and header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center mb-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 backdrop-blur-sm border border-primary/20 shadow-lg shadow-primary/5">
              <Music className="h-7 w-7 text-primary" />
            </div>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Music for Wellbeing</h1>
          <p className="text-sm text-muted-foreground mt-1.5">
            {mode === 'sign-in'
              ? 'Sign in to your funding dashboard'
              : 'Create your account to get started'}
          </p>
        </div>

        {/* Auth card */}
        <Card className="rounded-2xl border-border/60 shadow-xl shadow-black/5 backdrop-blur-sm">
          <CardContent className="p-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Error alert */}
              {error && (
                <div className="flex items-start gap-2.5 rounded-xl bg-destructive/10 border border-destructive/20 p-3 animate-in fade-in slide-in-from-top-1 duration-300">
                  <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                  <p className="text-sm text-destructive">{error}</p>
                </div>
              )}

              {/* Success alert */}
              {success && (
                <div className="flex items-start gap-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-3 animate-in fade-in slide-in-from-top-1 duration-300">
                  <Mail className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
                  <p className="text-sm text-emerald-700 dark:text-emerald-400">{success}</p>
                </div>
              )}

              {/* Email */}
              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm font-medium">
                  Email
                </Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-9 rounded-xl h-11"
                    autoComplete="email"
                    required
                  />
                </div>
              </div>

              {/* Password */}
              <div className="space-y-2">
                <Label htmlFor="password" className="text-sm font-medium">
                  Password
                </Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-9 rounded-xl h-11"
                    autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'}
                    required
                  />
                </div>
              </div>

              {/* Confirm password (sign-up only) */}
              {mode === 'sign-up' && (
                <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-300">
                  <Label htmlFor="confirm-password" className="text-sm font-medium">
                    Confirm Password
                  </Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="confirm-password"
                      type="password"
                      placeholder="••••••••"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="pl-9 rounded-xl h-11"
                      autoComplete="new-password"
                      required
                    />
                  </div>
                </div>
              )}

              {/* Submit button */}
              <Button
                type="submit"
                disabled={loading}
                className="w-full h-11 rounded-xl font-medium gap-2 transition-all duration-200"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {mode === 'sign-in' ? 'Signing in...' : 'Creating account...'}
                  </>
                ) : (
                  <>
                    {mode === 'sign-in' ? 'Sign In' : 'Create Account'}
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </Button>
            </form>

            {/* Toggle mode */}
            <div className="mt-6 pt-4 border-t border-border/60 text-center">
              <p className="text-sm text-muted-foreground">
                {mode === 'sign-in' ? "Don't have an account?" : 'Already have an account?'}{' '}
                <button
                  onClick={toggleMode}
                  className="font-medium text-primary hover:text-primary/80 transition-colors underline-offset-4 hover:underline"
                >
                  {mode === 'sign-in' ? 'Sign up' : 'Sign in'}
                </button>
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Footer */}
        <p className="text-center text-[11px] text-muted-foreground/50 mt-6 tracking-wide">
          Powered by Supabase · Charity Aid Pro
        </p>
      </div>
    </div>
  );
};

export default AuthPage;
