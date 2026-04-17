import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Lock, Loader2, Eye, EyeOff } from "lucide-react";

const API_BASE = "__PORT_5000__".startsWith("__") ? "" : "__PORT_5000__";

interface Props {
  onLogin: (token: string) => void;
}

export default function LoginPage({ onLogin }: Props) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        const data = await res.json();
        onLogin(data.token);
      } else {
        setError("Incorrect password. Please try again.");
        setPassword("");
      }
    } catch {
      setError("Could not connect to the server. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2.5 mb-8">
          <div className="p-2 rounded-lg bg-primary/10">
            <svg
              viewBox="0 0 24 24"
              width="24"
              height="24"
              fill="none"
              aria-label="CostTrack"
              className="text-primary"
            >
              <rect x="3" y="3" width="8" height="5" rx="1" stroke="currentColor" strokeWidth="1.5" />
              <rect x="3" y="11" width="8" height="10" rx="1" stroke="currentColor" strokeWidth="1.5" />
              <rect x="13" y="3" width="8" height="10" rx="1" stroke="currentColor" strokeWidth="1.5" />
              <rect x="13" y="16" width="8" height="5" rx="1" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </div>
          <span className="text-lg font-semibold tracking-tight">CostTrack</span>
        </div>

        {/* Card */}
        <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-1">
            <Lock size={14} className="text-muted-foreground" />
            <h1 className="text-sm font-semibold">Team Access</h1>
          </div>
          <p className="text-xs text-muted-foreground mb-5">
            Enter the team password to access CostTrack.
          </p>

          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="relative">
              <Input
                type={showPassword ? "text" : "password"}
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pr-10"
                autoFocus
                data-testid="input-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>

            {error && (
              <p className="text-xs text-destructive" data-testid="text-login-error">
                {error}
              </p>
            )}

            <Button
              type="submit"
              className="w-full"
              disabled={loading || !password}
              data-testid="button-login"
            >
              {loading ? <Loader2 size={14} className="animate-spin mr-2" /> : null}
              {loading ? "Signing in…" : "Sign In"}
            </Button>
          </form>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-4">
          Invoice Costing &amp; Cost Tracking System
        </p>
      </div>
    </div>
  );
}
