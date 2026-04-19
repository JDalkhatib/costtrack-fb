import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Lock, Loader2, Eye, EyeOff, ChevronLeft } from "lucide-react";
import { setAuth } from "@/lib/auth";
import { CostTrackLogo } from "@/components/CostTrackLogo";

const API_BASE = "__PORT_5000__".startsWith("__") ? "" : "__PORT_5000__";

interface Restaurant { id: number; name: string; }

interface Props {
  onLogin: (token: string, isAdmin: boolean, restaurantId: number | null, restaurantName: string | null) => void;
}

export default function LoginPage({ onLogin }: Props) {
  const [step, setStep] = useState<"select" | "password">("select");
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [selected, setSelected] = useState<Restaurant | null>(null); // null = admin
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loadingRestaurants, setLoadingRestaurants] = useState(true);

  useEffect(() => {
    fetch(`${API_BASE}/api/auth/restaurants`)
      .then((r) => r.json())
      .then((data) => setRestaurants(Array.isArray(data) ? data : []))
      .catch(() => setRestaurants([]))
      .finally(() => setLoadingRestaurants(false));
  }, []);

  function selectRestaurant(r: Restaurant | null) {
    setSelected(r);
    setError("");
    setPassword("");
    setStep("password");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const body: any = { password };
      if (selected) body.restaurantId = selected.id;

      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        const data = await res.json();
        setAuth(data.token, data.isAdmin, data.restaurantId ?? null, data.restaurantName ?? null);
        onLogin(data.token, data.isAdmin, data.restaurantId ?? null, data.restaurantName ?? null);
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
        <div className="flex flex-col items-center gap-4 mb-8">
          <CostTrackLogo size={80} />
          <div className="text-center">
            <span className="text-2xl font-bold tracking-tight block">
              Cost<span style={{ color: "#F59E0B" }}>Track</span>
            </span>
            <span className="text-xs text-muted-foreground tracking-wide uppercase">Invoice Intelligence</span>
          </div>
        </div>

        <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">

          {/* Step 1 — Select restaurant */}
          {step === "select" && (
            <div className="p-6">
              <div className="flex items-center gap-2 mb-1">
                <Lock size={14} className="text-muted-foreground" />
                <h1 className="text-sm font-semibold">Select your restaurant</h1>
              </div>
              <p className="text-xs text-muted-foreground mb-4">
                Choose your location to sign in.
              </p>

              {loadingRestaurants ? (
                <div className="flex justify-center py-4">
                  <Loader2 size={18} className="animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="space-y-2">
                  {restaurants.map((r) => (
                    <button
                      key={r.id}
                      onClick={() => selectRestaurant(r)}
                      className="w-full text-left px-4 py-3 rounded-lg border border-border bg-background hover:bg-accent hover:border-primary/30 transition-colors text-sm font-medium"
                    >
                      {r.name}
                    </button>
                  ))}

                  {restaurants.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-2">
                      No restaurants set up yet.
                    </p>
                  )}

                  {/* Admin login — subtle link at the bottom */}
                  <div className="pt-3 border-t border-border mt-3">
                    <button
                      onClick={() => selectRestaurant(null)}
                      className="w-full text-center text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
                    >
                      Admin sign in
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 2 — Enter password */}
          {step === "password" && (
            <div className="p-6">
              <button
                onClick={() => { setStep("select"); setError(""); }}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-4 transition-colors"
              >
                <ChevronLeft size={13} /> Back
              </button>

              <div className="flex items-center gap-2 mb-1">
                <Lock size={14} className="text-muted-foreground" />
                <h1 className="text-sm font-semibold">
                  {selected ? selected.name : "Admin Access"}
                </h1>
              </div>
              <p className="text-xs text-muted-foreground mb-5">
                Enter the password to continue.
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
                  <p className="text-xs text-destructive">{error}</p>
                )}

                <Button type="submit" className="w-full" disabled={loading || !password}>
                  {loading ? <Loader2 size={14} className="animate-spin mr-2" /> : null}
                  {loading ? "Signing in…" : "Sign In"}
                </Button>
              </form>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
