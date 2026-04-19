import { useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { PlusCircle, Search, ChefHat, DollarSign, Percent } from "lucide-react";
import type { Recipe } from "@/lib/recipeTypes";

const CLASSIFICATIONS = ["All", "Appetizer", "Soup", "Salad", "Entrée", "Side", "Dessert", "Beverage", "Sauce", "Other"];

function costColor(pct: number) {
  if (pct <= 0.28) return "text-green-600 dark:text-green-400";
  if (pct <= 0.35) return "text-yellow-600 dark:text-yellow-400";
  return "text-red-600 dark:text-red-400";
}

export default function RecipesPage() {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All");

  const { data: recipes = [], isLoading } = useQuery<Recipe[]>({
    queryKey: ["/api/recipes"],
    queryFn: () => apiRequest("GET", "/api/recipes").then((r) => r.json()),
  });

  const filtered = recipes.filter((r) => {
    const matchesSearch = r.name.toLowerCase().includes(search.toLowerCase());
    const matchesFilter = filter === "All" || r.classification === filter;
    return matchesSearch && matchesFilter;
  });

  // Group by classification
  const grouped = filter === "All"
    ? filtered.reduce<Record<string, Recipe[]>>((acc, r) => {
        const key = r.classification || "Other";
        if (!acc[key]) acc[key] = [];
        acc[key].push(r);
        return acc;
      }, {})
    : { [filter]: filtered };

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
        <Link href="/recipes/new">
          <Button className="gap-1.5">
            <PlusCircle size={14} />
            New Recipe
          </Button>
        </Link>
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
          <p className="text-sm text-muted-foreground mb-4">Create your first recipe cost card</p>
          <Link href="/recipes/new">
            <Button variant="outline" size="sm">
              <PlusCircle size={14} className="mr-1.5" /> New Recipe
            </Button>
          </Link>
        </div>
      )}

      {/* Recipe groups */}
      {!isLoading && Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([group, items]) => (
        <div key={group}>
          {filter === "All" && (
            <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">{group}</h2>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {items.map((recipe) => {
              const totalIngredientCost = (recipe.ingredients ?? []).reduce((s, i) => s + i.ingredientCost, 0);
              const qCost = totalIngredientCost * (1 + recipe.qFactor);
              const portionCost = recipe.standardYield > 0 ? qCost / recipe.standardYield : qCost;
              const actualCostPct = recipe.actualMenuPrice > 0 ? portionCost / recipe.actualMenuPrice : 0;
              const prelim = recipe.desiredCostPct > 0 ? portionCost / recipe.desiredCostPct : 0;

              return (
                <Link key={recipe.id} href={`/recipes/${recipe.id}`}>
                  <div className="group bg-card border border-border rounded-xl overflow-hidden hover:border-primary/40 hover:shadow-md transition-all cursor-pointer">
                    {/* Photo or placeholder */}
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
                        <h3 className="font-semibold text-sm leading-tight group-hover:text-primary transition-colors">{recipe.name}</h3>
                        {recipe.classification && (
                          <Badge variant="secondary" className="text-xs shrink-0">{recipe.classification}</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <DollarSign size={11} />
                          <span className="font-medium text-foreground">${portionCost.toFixed(2)}</span>
                          <span>/ portion</span>
                        </span>
                        {recipe.actualMenuPrice > 0 && (
                          <span className={`flex items-center gap-1 font-medium ${costColor(actualCostPct)}`}>
                            <Percent size={11} />
                            {(actualCostPct * 100).toFixed(1)}% cost
                          </span>
                        )}
                        {recipe.actualMenuPrice === 0 && prelim > 0 && (
                          <span className="flex items-center gap-1">
                            <span>Target $</span>
                            <span className="font-medium text-foreground">{prelim.toFixed(2)}</span>
                          </span>
                        )}
                      </div>
                      {(recipe.ingredients ?? []).length > 0 && (
                        <p className="text-xs text-muted-foreground mt-1.5">
                          {(recipe.ingredients ?? []).length} ingredient{(recipe.ingredients ?? []).length !== 1 ? "s" : ""}
                          {recipe.allergens.length > 0 && ` · ${recipe.allergens.slice(0, 2).join(", ")}${recipe.allergens.length > 2 ? "…" : ""}`}
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
    </div>
  );
}
