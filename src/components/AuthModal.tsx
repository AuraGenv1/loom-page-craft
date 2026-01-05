import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Mail, Loader2 } from "lucide-react";

interface AuthModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onGoogleSignIn: () => Promise<{ error: Error | null }>;
  isAuthenticating: boolean;
}

type AuthView = "options" | "email-signup" | "email-login";

const AuthModal = ({ open, onOpenChange, onGoogleSignIn, isAuthenticating }: AuthModalProps) => {
  const [view, setView] = useState<AuthView>("options");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);

  const resetForm = () => {
    setEmail("");
    setPassword("");
    setFullName("");
    setView("options");
  };

  const handleClose = (open: boolean) => {
    if (!open) resetForm();
    onOpenChange(open);
  };

  const handleGoogleClick = async () => {
    const { error } = await onGoogleSignIn();
    if (error) {
      toast.error("Failed to sign in with Google");
    }
  };

  const handleEmailSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error("Please fill in all fields");
      return;
    }
    if (password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }

    setLoading(true);
    const redirectUrl = window.location.origin;

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: {
          full_name: fullName || undefined,
        },
      },
    });

    setLoading(false);

    if (error) {
      if (error.message.includes("already registered")) {
        toast.error("This email is already registered. Please sign in instead.");
        setView("email-login");
      } else {
        toast.error(error.message);
      }
      return;
    }

    toast.success("Account created! You can now use the app.");
    handleClose(false);
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error("Please fill in all fields");
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setLoading(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Signed in successfully!");
    handleClose(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl text-center">
            {view === "options" && "Join LOOM & PAGE"}
            {view === "email-signup" && "Create an account"}
            {view === "email-login" && "Welcome back"}
          </DialogTitle>
        </DialogHeader>

        {view === "options" && (
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground text-center">
              Save your guides to the cloud and access them anywhere.
            </p>

            <Button onClick={handleGoogleClick} disabled={isAuthenticating} className="w-full gap-2" variant="outline">
              {isAuthenticating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <svg className="h-4 w-4" viewBox="0 0 24 24">
                  <path
                    fill="currentColor"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="currentColor"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="currentColor"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="currentColor"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
              )}
              Sign in
            </Button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <Separator className="w-full" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">or</span>
              </div>
            </div>

            <Button onClick={() => setView("email-signup")} variant="outline" className="w-full gap-2">
              <Mail className="h-4 w-4" />
              Sign up with Email
            </Button>

            <p className="text-xs text-center text-muted-foreground">
              Already have an account?{" "}
              <button onClick={() => setView("email-login")} className="text-primary hover:underline">
                Sign in
              </button>
            </p>
          </div>
        )}

        {view === "email-signup" && (
          <form onSubmit={handleEmailSignUp} className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="fullName">Name (optional)</Label>
              <Input
                id="fullName"
                type="text"
                placeholder="Your name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="At least 6 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create account"}
            </Button>
            <p className="text-xs text-center text-muted-foreground">
              Already have an account?{" "}
              <button type="button" onClick={() => setView("email-login")} className="text-primary hover:underline">
                Sign in
              </button>
            </p>
            <button
              type="button"
              onClick={() => setView("options")}
              className="text-xs text-muted-foreground hover:underline w-full text-center"
            >
              ← Back to options
            </button>
          </form>
        )}

        {view === "email-login" && (
          <form onSubmit={handleEmailLogin} className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="login-email">Email</Label>
              <Input
                id="login-email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="login-password">Password</Label>
              <Input
                id="login-password"
                type="password"
                placeholder="Your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sign in"}
            </Button>
            <p className="text-xs text-center text-muted-foreground">
              Don't have an account?{" "}
              <button type="button" onClick={() => setView("email-signup")} className="text-primary hover:underline">
                Sign up
              </button>
            </p>
            <button
              type="button"
              onClick={() => setView("options")}
              className="text-xs text-muted-foreground hover:underline w-full text-center"
            >
              ← Back to options
            </button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default AuthModal;
