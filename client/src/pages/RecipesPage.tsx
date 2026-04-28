import { useState, useRef } from "react";
import { Link } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  PlusCircle,
  Search,
  ChefHat,
  DollarSign,
  Percent,
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  X,
  Loader2,
} from "lucide-react";
import type { Recipe } from "@/lib/recipeTypes";

const CLASSIFICATIONS = ["All", "Appetizer", "Soup", "Salad", "Entrée", "Side", "Dessert", "Beverage", "Sauce", "Other"];

function costColor(pct: number) {
  if (pct <= 0.28) return "text-green-600 dark:text-green-400";
  if (pct <= 0.35) return "text-yellow-600 dark:text-yellow-400";
  return "text-red-600 dark:text-red-400";
}

interface ImportResult {
  imported: { id: number; name: string; sheetName: string }[];
  skipped: { sheetName: string; reason: string }[];
}

export default function RecipesPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All");

  // Import modal state
  const [importOpen, setImportOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const { data: recipes = [], isLoading } = useQuery<Recipe[]>({
    queryKey: ["/api/recipes"],
    queryFn: () => apiRequest("GET", "/api/recipes").then((r) => r.json()),
  });

  const filtered = recipes.filter((r) => {
    const matchesSearch = r.name.toLowerCase().includes(search.toLowerCase());
    const matchesFilter = filter === "All" || r.classification === filter;
    return matchesSearch && matchesFilter;
  });

  const grouped =
    filter === "All"
      ? filtered.reduce<Record<string, Recipe[]>>((acc, r) => {
          const key = r.classification || "Other";
          if (!acc[key]) acc[key] = [];
          acc[key].push(r);
          return acc;
        }, {})
      : { [filter]: filtered };

  // ── Import handlers ──────────────────────────────────────────
  function openImport() {
    setImportFile(null);
    setImportResult(null);
    setImportError(null);
    setImportOpen(true);
  }

  function handleFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setImportFile(f);
    setImportResult(null);
    setImportError(null);
  }

  async function runImport() {
    if (!importFile) return;
    setImporting(true);
    setImportError(null);
    setImportResult(null);
    try {
      const form = new FormData();
      form.append("file", importFile);
      const res = await apiRequest("POST", "/api/recipes/import-excel", form);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Import failed");
      setImportResult(data as ImportResult);
      queryClient.invalidateQueries({ queryKey: ["/api/recipes"] });
    } catch (err: any) {
      setImportError(err.message ?? "Something went wrong");
    } finally {
      setImporting(false);
    }
  }

  function closeImport() {
    setImportOpen(false);
    if (importResult?.imported?.length) {
      toast({
        title: `${importResult.imported.length} recipe${importResult.imported.length !== 1 ? "s" : ""} imported`,
        description: importResult.imported.map((r) => r.name).join(", "),
      });
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <ChefHat size={22} className="text-primary" />
            Recipe Cost Cards
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {recipes.length} recipe{recipes.length !== 1 ? "s" : ""} — costs auto-update from invoices
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-1.5" onClick={openImport}>
            <FileSpreadsheet size={14} />
            Import Excel
          </Button>
          <Link href="/recipes/new">
            <Button className="gap-1.5">
              <PlusCircle size={14} />
              New Recipe
            </Button>
          </Link>
        </div>
      </div>

      {/* Search + filter bar */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search recipes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {CLASSIFICATIONS.map((c) => (
            <button
              key={c}
              onClick={() => setFilter(c)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors border ${
                filter === c
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border bg-card text-muted-foreground hover:text-foreground hover:border-primary/30"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-40 rounded-xl bg-muted animate-pulse" />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && recipes.length === 0 && (
        <div className="text-center py-20 border-2 border-dashed border-border rounded-xl">
          <ChefHat size={40} className="mx-auto text-muted-foreground mb-3" />
          <p className="font-medium text-muted-foreground">No recipes yet</p>
          <p className="text-sm text-muted-foreground mb-4">
            Create one manually or import from an Excel cost card
          </p>
          <div className="flex gap-2 justify-center">
            <Button variant="outline" size="sm" onClick={openImport}>
              <FileSpreadsheet size={14} className="mr-1.5" /> Import Excel
            </Button>
            <Link href="/recipes/new">
              <Button variant="outline" size="sm">
                <PlusCircle size={14} className="mr-1.5" /> New Recipe
              </Button>
            </Link>
          </div>
        </div>
      )}

      {/* Recipe groups */}
      {!isLoading &&
        Object.entries(grouped)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([group, items]) => (
            <div key={group}>
              {filter === "All" && (
                <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
                  {group}
                </h2>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {items.map((recipe) => {
                  const totalIngredientCost = (recipe.ingredients ?? []).reduce(
                    (s, i) => s + i.ingredientCost,
                    0
                  );
                  const qCost = totalIngredientCost * (1 + recipe.qFactor);
                  const portionCost =
                    recipe.standardYield > 0 ? qCost / recipe.standardYield : qCost;
                  const actualCostPct =
                    recipe.actualMenuPrice > 0
                      ? portionCost / recipe.actualMenuPrice
                      : 0;
                  const prelim =
                    recipe.desiredCostPct > 0
                      ? portionCost / recipe.desiredCostPct
                      : 0;

                  return (
                    <Link key={recipe.id} href={`/recipes/${recipe.id}`}>
                      <div className="group bg-card border border-border rounded-xl overflow-hidden hover:border-primary/40 hover:shadow-md transition-all cursor-pointer">
                        {recipe.photoUrl ? (
                          <img
                            src={recipe.photoUrl}
                            alt={recipe.name}
                            className="w-full h-36 object-cover"
                          />
                        ) : (
                          <div className="w-full h-36 bg-muted flex items-center justify-center">
                            <ChefHat size={32} className="text-muted-foreground/40" />
                          </div>
                        )}
                        <div className="p-4">
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <h3 className="font-semibold text-sm leading-tight group-hover:text-primary transition-colors">
                              {recipe.name}
                            </h3>
                            {recipe.classification && (
                              <Badge variant="secondary" className="text-xs shrink-0">
                                {recipe.classification}
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-4 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <DollarSign size={11} />
                              <span className="font-medium text-foreground">
                                ${portionCost.toFixed(2)}
                              </span>
                              <span>/ portion</span>
                            </span>
                            {recipe.actualMenuPrice > 0 && (
                              <span
                                className={`flex items-center gap-1 font-medium ${costColor(actualCostPct)}`}
                              >
                                <Percent size={11} />
                                {(actualCostPct * 100).toFixed(1)}% cost
                              </span>
                            )}
                            {recipe.actualMenuPrice === 0 && prelim > 0 && (
                              <span className="flex items-center gap-1">
                                <span>Target $</span>
                                <span className="font-medium text-foreground">
                                  {prelim.toFixed(2)}
                                </span>
                              </span>
                            )}
                          </div>
                          {(recipe.ingredients ?? []).length > 0 && (
                            <p className="text-xs text-muted-foreground mt-1.5">
                              {(recipe.ingredients ?? []).length} ingredient
                              {(recipe.ingredients ?? []).length !== 1 ? "s" : ""}
                              {recipe.allergens.length > 0 &&
                                ` · ${recipe.allergens.slice(0, 2).join(", ")}${recipe.allergens.length > 2 ? "…" : ""}`}
                            </p>
                          )}
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}

      {/* ── Import Excel Modal ─────────────────────────────────── */}
      <Dialog open={importOpen} onOpenChange={(o) => { if (!o) closeImport(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet size={18} className="text-primary" />
              Import Excel Cost Cards
            </DialogTitle>
            <DialogDescription>
              Upload your cost card Excel file (.xls or .xlsx). Each sheet that contains a
              "STANDARD RECIPE COST CARD" will be imported as a separate recipe.
            </DialogDescription>
          </DialogHeader>

          {/* File picker */}
          {!importResult && (
            <div className="space-y-4 mt-2">
              <div
                className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
                  importFile
                    ? "border-primary/60 bg-primary/5"
                    : "border-border hover:border-primary/40 hover:bg-muted/50"
                }`}
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  className="hidden"
                  onChange={handleFilePick}
                />
                {importFile ? (
                  <div className="flex items-center justify-center gap-2">
                    <FileSpreadsheet size={20} className="text-primary shrink-0" />
                    <span className="text-sm font-medium text-primary truncate max-w-[200px]">
                      {importFile.name}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setImportFile(null);
                        if (fileInputRef.current) fileInputRef.current.value = "";
                      }}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <>
                    <Upload size={24} className="mx-auto text-muted-foreground mb-2" />
                    <p className="text-sm text-muted-foreground">
                      Click to select a file
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      .xls or .xlsx · max 20MB
                    </p>
                  </>
                )}
              </div>

              {importError && (
                <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">
                  <AlertCircle size={15} className="shrink-0 mt-0.5" />
                  {importError}
                </div>
              )}

              <div className="flex gap-2 justify-end">
                <Button variant="ghost" onClick={closeImport} disabled={importing}>
                  Cancel
                </Button>
                <Button
                  onClick={runImport}
                  disabled={!importFile || importing}
                  className="gap-1.5"
                >
                  {importing ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      Importing…
                    </>
                  ) : (
                    <>
                      <Upload size={14} />
                      Import
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* Results */}
          {importResult && (
            <div className="space-y-4 mt-2">
              {importResult.imported.length > 0 && (
                <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-xl p-4">
                  <p className="text-sm font-semibold text-green-800 dark:text-green-300 flex items-center gap-1.5 mb-2">
                    <CheckCircle2 size={15} />
                    {importResult.imported.length} recipe
                    {importResult.imported.length !== 1 ? "s" : ""} imported
                  </p>
                  <ul className="space-y-0.5">
                    {importResult.imported.map((r) => (
                      <li key={r.id} className="text-xs text-green-700 dark:text-green-400">
                        • {r.name}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {importResult.skipped.length > 0 && (
                <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl p-4">
                  <p className="text-sm font-semibold text-amber-800 dark:text-amber-300 flex items-center gap-1.5 mb-2">
                    <AlertCircle size={15} />
                    {importResult.skipped.length} skipped
                  </p>
                  <ul className="space-y-0.5">
                    {importResult.skipped.map((s, i) => (
                      <li key={i} className="text-xs text-amber-700 dark:text-amber-400">
                        • {s.reason}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => { setImportResult(null); setImportFile(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}>
                  Import Another
                </Button>
                <Button onClick={closeImport}>Done</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
