import { useParams, useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  ChevronLeft, Pencil, Trash2, ChefHat, DollarSign,
  Percent, AlertTriangle, ClipboardList, Layers,
} from "lucide-react";
import type { Recipe } from "@/lib/recipeTypes";

function costColor(pct: number) {
  if (pct <= 0.28) return "text-green-600 dark:text-green-400";
  if (pct <= 0.35) return "text-yellow-600 dark:text-yellow-400";
  return "text-red-600 dark:text-red-400";
}

function Row({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`flex justify-between items-center py-2 border-b border-border last:border-0 ${highlight ? "font-semibold" : ""}`}>
      <span className={highlight ? "text-foreground" : "text-muted-foreground text-sm"}>{label}</span>
      <span className={highlight ? "text-primary text-base" : "text-sm font-medium"}>{value}</span>
    </div>
  );
}

export default function RecipeDetailPage() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: recipe, isLoading } = useQuery<Recipe>({
    queryKey: [`/api/recipes/${params.id}`],
    queryFn: () => apiRequest("GET", `/api/recipes/${params.id}`).then((r) => r.json()),
  });

  async function handleDelete() {
    if (!confirm("Delete this recipe? This cannot be undone.")) return;
    try {
      await apiRequest("DELETE", `/api/recipes/${params.id}`);
      queryClient.invalidateQueries({ queryKey: ["/api/recipes"] });
      toast({ title: "Recipe deleted" });
      navigate("/recipes");
    } catch {
      toast({ title: "Failed to delete recipe", variant: "destructive" });
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 bg-muted rounded animate-pulse" />
        <div className="h-64 bg-muted rounded-xl animate-pulse" />
      </div>
    );
  }

  if (!recipe) {
    return (
      <div className="text-center py-20">
        <p className="text-muted-foreground">Recipe not found.</p>
        <Button variant="ghost" onClick={() => navigate("/recipes")}>Back to Recipes</Button>
      </div>
    );
  }

  const ingredients = recipe.ingredients ?? [];
  const totalIngredientCost = ingredients.reduce((s, i) => s + i.ingredientCost, 0);
  const recipeCost = totalIngredientCost * (1 + recipe.qFactor);
  const portionCost = recipe.standardYield > 0 ? recipeCost / recipe.standardYield : recipeCost;
  const prelimMenuPrice = recipe.desiredCostPct > 0 ? portionCost / recipe.desiredCostPct : 0;
  const actualCostPct = recipe.actualMenuPrice > 0 ? portionCost / recipe.actualMenuPrice : 0;
  const profitAfterFoodCost = recipe.actualMenuPrice > 0 ? recipe.actualMenuPrice - portionCost : 0;

  return (
    <div className="space-y-6 pb-12 max-w-4xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3">
          <button onClick={() => navigate("/recipes")} className="text-muted-foreground hover:text-foreground transition-colors mt-1">
            <ChevronLeft size={20} />
          </button>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-2xl font-bold tracking-tight">{recipe.name}</h1>
              {recipe.classification && (
                <Badge variant="secondary">{recipe.classification}</Badge>
              )}
            </div>
            <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground flex-wrap">
              {recipe.standardPortion && <span>Portion: {recipe.standardPortion}</span>}
              {recipe.standardYield > 1 && <span>Yield: {recipe.standardYield} portions</span>}
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate(`/recipes/${params.id}/edit`)} className="gap-1.5">
            <Pencil size={13} /> Edit
          </Button>
          <Button variant="ghost" size="sm" onClick={handleDelete} className="gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10">
            <Trash2 size={13} /> Delete
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6">
        {/* Left column */}
        <div className="space-y-5">

          {/* Photo */}
          {recipe.photoUrl && (
            <div className="rounded-xl overflow-hidden border border-border">
              <img src={recipe.photoUrl} alt={recipe.name} className="w-full max-h-72 object-cover" />
            </div>
          )}

          {/* Ingredients table */}
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-border flex items-center gap-2">
              <Layers size={14} className="text-muted-foreground" />
              <h2 className="font-semibold text-sm">Ingredients</h2>
              <span className="text-xs text-muted-foreground ml-auto">{ingredients.length} items</span>
            </div>
            {ingredients.length === 0 ? (
              <div className="px-5 py-8 text-center text-sm text-muted-foreground">No ingredients added yet.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/40">
                      <th className="text-left px-5 py-2 text-xs font-medium text-muted-foreground">Ingredient</th>
                      <th className="text-center px-3 py-2 text-xs font-medium text-muted-foreground">Qty</th>
                      <th className="text-center px-3 py-2 text-xs font-medium text-muted-foreground">Unit</th>
                      <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">Unit Cost</th>
                      <th className="text-right px-5 py-2 text-xs font-medium text-muted-foreground">Ing. Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ingredients.map((ing, i) => (
                      <tr key={i} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                        <td className="px-5 py-2.5 font-medium">
                          {ing.ingredientName}
                          {ing.lineItemId && (
                            <span className="ml-1.5 text-xs text-primary opacity-60" title="Linked to invoice">●</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-center text-muted-foreground">{ing.recipeQuantity}</td>
                        <td className="px-3 py-2.5 text-center text-muted-foreground">{ing.recipeUnit}</td>
                        <td className="px-3 py-2.5 text-right text-muted-foreground">${ing.unitCost.toFixed(3)}</td>
                        <td className="px-5 py-2.5 text-right font-medium">${ing.ingredientCost.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-muted/40 font-semibold">
                      <td colSpan={4} className="px-5 py-2.5 text-sm">Total Ingredient Cost</td>
                      <td className="px-5 py-2.5 text-right text-primary">${totalIngredientCost.toFixed(2)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>

          {/* Method of Preparation */}
          {recipe.methodOfPreparation && (
            <div className="bg-card border border-border rounded-xl p-5 space-y-3">
              <div className="flex items-center gap-2">
                <ClipboardList size={14} className="text-muted-foreground" />
                <h2 className="font-semibold text-sm">Method of Preparation</h2>
              </div>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">{recipe.methodOfPreparation}</p>
            </div>
          )}

          {/* Plating Instructions */}
          {recipe.platingInstructions && (
            <div className="bg-card border border-border rounded-xl p-5 space-y-3">
              <div className="flex items-center gap-2">
                <ChefHat size={14} className="text-muted-foreground" />
                <h2 className="font-semibold text-sm">Plating Instructions</h2>
              </div>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">{recipe.platingInstructions}</p>
            </div>
          )}

          {/* Notes */}
          {recipe.notes && (
            <div className="bg-card border border-border rounded-xl p-5 space-y-3">
              <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">Notes</h2>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">{recipe.notes}</p>
            </div>
          )}

          {/* Allergens */}
          {recipe.allergens.length > 0 && (
            <div className="bg-card border border-border rounded-xl p-5 space-y-3">
              <div className="flex items-center gap-2">
                <AlertTriangle size={14} className="text-destructive" />
                <h2 className="font-semibold text-sm">Allergens</h2>
              </div>
              <div className="flex flex-wrap gap-2">
                {recipe.allergens.map((a) => (
                  <Badge key={a} variant="destructive" className="text-xs bg-destructive/10 text-destructive border border-destructive/30">
                    {a}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right — cost summary */}
        <div className="space-y-4 sticky top-20 self-start">
          <div className="bg-card border border-border rounded-xl p-5 space-y-1">
            <h3 className="font-semibold text-sm mb-3">Cost Summary</h3>
            <Row label="Total Ingredient Cost" value={`$${totalIngredientCost.toFixed(2)}`} />
            <Row label={`Q Factor (${(recipe.qFactor * 100).toFixed(0)}% waste)`} value={`+ $${(recipeCost - totalIngredientCost).toFixed(2)}`} />
            <Row label="Recipe Cost" value={`$${recipeCost.toFixed(2)}`} />
            <Row label={`Portion Cost (÷${recipe.standardYield})`} value={`$${portionCost.toFixed(2)}`} highlight />

            <div className="pt-3 mt-1 space-y-1 border-t border-border">
              <Row label={`Target Price (${(recipe.desiredCostPct * 100).toFixed(0)}% cost)`} value={`$${prelimMenuPrice.toFixed(2)}`} />
              {recipe.actualMenuPrice > 0 && (
                <>
                  <Row label="Menu Price" value={`$${recipe.actualMenuPrice.toFixed(2)}`} />
                  <div className={`flex justify-between items-center py-2 border-b border-border font-semibold`}>
                    <span className="text-foreground">Actual Cost %</span>
                    <span className={`text-base ${costColor(actualCostPct)}`}>{(actualCostPct * 100).toFixed(1)}%</span>
                  </div>
                  <div className="flex justify-between items-center py-2 font-semibold">
                    <span className="text-foreground">Profit After Food Cost</span>
                    <span className="text-green-600 dark:text-green-400 text-base">${profitAfterFoodCost.toFixed(2)}</span>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Quick stats */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-card border border-border rounded-xl p-4 text-center">
              <DollarSign size={18} className="mx-auto mb-1 text-primary" />
              <p className="text-lg font-bold">${portionCost.toFixed(2)}</p>
              <p className="text-xs text-muted-foreground">Per Portion</p>
            </div>
            {recipe.actualMenuPrice > 0 ? (
              <div className="bg-card border border-border rounded-xl p-4 text-center">
                <Percent size={18} className={`mx-auto mb-1 ${costColor(actualCostPct)}`} />
                <p className={`text-lg font-bold ${costColor(actualCostPct)}`}>{(actualCostPct * 100).toFixed(1)}%</p>
                <p className="text-xs text-muted-foreground">Food Cost</p>
              </div>
            ) : (
              <div className="bg-card border border-border rounded-xl p-4 text-center">
                <DollarSign size={18} className="mx-auto mb-1 text-muted-foreground" />
                <p className="text-lg font-bold">${prelimMenuPrice.toFixed(2)}</p>
                <p className="text-xs text-muted-foreground">Target Price</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
