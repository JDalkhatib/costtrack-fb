import { Link, useLocation } from "wouter";
import { useTheme } from "@/components/ThemeProvider";
import { Sun, Moon, FileText, Tag, PlusCircle, LogOut, ShieldCheck, ChefHat } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CostTrackLogo } from "@/components/CostTrackLogo";

interface LayoutProps {
  children: React.ReactNode;
  restaurantName?: string | null;
  isAdmin?: boolean;
  onLogout?: () => void;
}

export function Layout({ children, restaurantName, isAdmin, onLogout }: LayoutProps) {
  const { theme, toggleTheme } = useTheme();
  const [location] = useLocation();

  const navLinks = [
    { href: "/", label: "Invoices", icon: FileText },
    { href: "/categories", label: "By Category", icon: Tag },
    { href: "/recipes", label: "Recipes", icon: ChefHat },
    ...(isAdmin ? [{ href: "/admin", label: "Admin", icon: ShieldCheck }] : []),
  ];

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Header */}
      <header className="border-b border-border bg-card/80 backdrop-blur sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between gap-4">

          {/* Logo + restaurant name */}
          <Link href="/" className="flex items-center gap-2.5 shrink-0">
            <CostTrackLogo size={34} />
            <div className="flex flex-col leading-tight">
              <span className="font-semibold text-sm tracking-tight">
                F<span style={{ color: "#D4AF37" }}>&amp;</span>B
              </span>
              {restaurantName ? (
                <span className="text-xs text-muted-foreground leading-tight">{restaurantName}</span>
              ) : (
                <span className="text-xs text-muted-foreground leading-tight">CostTrack</span>
              )}
            </div>
          </Link>

          {/* Nav */}
          <nav className="flex items-center gap-1">
            {navLinks.map(({ href, label, icon: Icon }) => (
              <Link key={href} href={href}>
                <Button
                  variant={location === href ? "secondary" : "ghost"}
                  size="sm"
                  className="gap-1.5"
                >
                  <Icon size={14} />
                  <span className="hidden sm:inline">{label}</span>
                </Button>
              </Link>
            ))}
          </nav>

          {/* Right actions */}
          <div className="flex items-center gap-2 shrink-0">
            <Link href="/invoices/new">
              <Button size="sm" className="gap-1.5">
                <PlusCircle size={14} />
                <span className="hidden sm:inline">New Invoice</span>
              </Button>
            </Link>
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleTheme}
              aria-label="Toggle theme"
              className="h-8 w-8"
            >
              {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
            </Button>
            {onLogout && (
              <Button
                variant="ghost"
                size="icon"
                onClick={onLogout}
                aria-label="Sign out"
                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                title="Sign out"
              >
                <LogOut size={15} />
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-6">
        {children}
      </main>
    </div>
  );
}
