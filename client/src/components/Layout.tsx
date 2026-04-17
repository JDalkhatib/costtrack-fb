import { Link, useLocation } from "wouter";
import { useTheme } from "@/components/ThemeProvider";
import { Sun, Moon, FileText, Tag, PlusCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Layout({ children }: { children: React.ReactNode }) {
  const { theme, toggleTheme } = useTheme();
  const [location] = useLocation();

  const navLinks = [
    { href: "/", label: "Invoices", icon: FileText },
    { href: "/categories", label: "By Category", icon: Tag },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Header */}
      <header className="border-b border-border bg-card/80 backdrop-blur sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 shrink-0">
            <svg
              aria-label="CostTrack"
              viewBox="0 0 32 32"
              width="28"
              height="28"
              fill="none"
              className="text-primary"
            >
              <rect x="2" y="4" width="20" height="24" rx="2" stroke="currentColor" strokeWidth="2" />
              <path d="M7 10h10M7 15h10M7 20h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              <circle cx="25" cy="25" r="6" fill="currentColor" fillOpacity="0.15" stroke="currentColor" strokeWidth="2" />
              <path d="M25 22v3l2 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <span className="font-semibold text-sm tracking-tight">CostTrack</span>
          </Link>

          {/* Nav */}
          <nav className="flex items-center gap-1">
            {navLinks.map(({ href, label, icon: Icon }) => (
              <Link key={href} href={href}>
                <Button
                  variant={location === href ? "secondary" : "ghost"}
                  size="sm"
                  className="gap-1.5"
                  data-testid={`nav-${label.toLowerCase().replace(/\s+/g, "-")}`}
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
              <Button size="sm" className="gap-1.5" data-testid="button-new-invoice">
                <PlusCircle size={14} />
                <span className="hidden sm:inline">New Invoice</span>
              </Button>
            </Link>
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleTheme}
              aria-label="Toggle theme"
              data-testid="button-theme-toggle"
              className="h-8 w-8"
            >
              {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
            </Button>
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
