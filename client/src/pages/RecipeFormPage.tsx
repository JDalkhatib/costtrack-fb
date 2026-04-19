import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation, useParams } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Save, Trash2, ChevronLeft, Plus, X, Camera, Search, Link as LinkIcon,
} from "lucide-react";
import type { Recipe, RecipeIngredient, IngredientSuggestion } from "@/lib/recipeTypes";
import { ALLERGENS, CLASSIFICATIONS, UNITS } from "@/lib/recipeTypes";

const API_BASE = "__PORT_5000__".startsWith("__") ? "" : "__PORT_5000__";

// ── Cost math helpers ──────────────────────────────────────────────────────
function calcCosts(ingredients: RecipeIngredient[], qFactor: number, standardYield: number, actualMenuPrice: number, desiredCostPct: number) {
  const totalIngredientCost = ingredients.reduce((s, i) => s + i.ingredientCost, 0);
  const recipeCost = totalIngredientCost * (1 + qFactor);
  const portionCost = standardYield > 0 ? recipeCost / standardYield : recipeCost;
  const prelimMenuPrice = desiredCostPct > 0 ? portionCost / desiredCostPct : 0;
  const actualCostPct = actualMenuPrice > 0 ? portionCost / actualMenuPrice : 0;
  const profitAfterFoodCost = actualMenuPrice > 0 ? actualMenuPrice - portionCost : 0;
  return { totalIngredientCost, recipeCost, portionCost, prelimMenuPrice, actualCostPct, profitAfterFoodCost };
}

// ── Ingredient row component ───────────────────────────────────────────────
function IngredientRow({
  ing, index, onChange, onRemove, restaurantId,
}: {
  ing: RecipeIngredient;
  index: number;
  onChange: (i: number, updated: Partial<RecipeIngredient>) => void;
  onRemove: (i: number) => void;
  restaurantId: number | null;
}) {
  const [query, setQuery] = useState(ing.ingredientName || "");
  const [suggestions, setSuggestions] = useState<IngredientSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const token = localStorage.getItem("auth_token") || "";

  const searchIngredients = useCallback((q: string) => {
    if (!q.trim() || q.length < 2) { setSuggestions([]); return; }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`${API_BASE}/api/recipes/ingredients/search?q=${encodeURIComponent(q)}`, {
          headers: { "x-auth-token": token },
        });
        const data = await res.json();
        setSuggestions(Array.isArray(data) ? data : []);
        setShowSuggestions(true);
      } catch { setSuggestions([]); }
    }, 300);
  }, [token]);

  function pickSuggestion(s: IngredientSuggestion) {
    setQuery(s.name);
    setShowSuggestions(false);
    setSuggestions([]);
    onChange(index, {
      ingredientName: s.name,
      unitCost: s.unitCost,
      recipeUnit: s.packUnit || s.unit || ing.recipeUnit,
      lineItemId: s.id,
      ingredientCost: s.unitCost * ing.recipeQuantity,
    });
  }

  function handleQtyChange(qty: number) {
    onChange(index, {
      recipeQuantity: qty,
      ingredientCost: ing.unitCost * qty,
    });
  }

  function handleUnitCostChange(cost: number) {
    onChange(index, {
      unitCost: cost,
      ingredientCost: cost * ing.recipeQuantity,
    });
  }

  return (
    <div className="grid grid-cols-[1fr_80px_100px_90px_90px_32px] gap-2 items-center">
      {/* Ingredient name with autocomplete */}
      <div className="relative">
        <Input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            onChange(index, { ingredientName: e.target.value, lineItemId: null });
            searchIngredients(e.target.value);
          }}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
          onFocus={() => query.length >= 2 && searchIngredients(query)}
          placeholder="Ingredient name"
          className="text-sm h-8"
        />
        {ing.lineItemId && (
          <LinkIcon size={10} className="absolute right-2 top-1/2 -translate-y-1/2 text-primary opacity-60" />
        )}
        {showSuggestions && suggestions.length > 0 && (
          <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-card border border-border rounded-lg shadow-lg overflow-hidden max-h-48 overflow-y-auto">
            {suggestions.map((s) => (
              <button
                key={s.id}
                type="button"
                onMouseDown={() => pickSuggestion(s)}
                className="w-full text-left px-3 py-2 text-xs hover:bg-accent flex items-center justify-between gap-2"
              >
                <span className="font-medium">{s.name}</span>
                <span className="text-muted-foreground shrink-0">
                  ${s.unitCost.toFixed(3)}/{s.packUnit || s.unit}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Qty */}
      <Input
        type="number"
        min={0}
        step={0.01}
        value={ing.recipeQuantity || ""}
        onChange={(e) => handleQtyChange(parseFloat(e.target.value) || 0)}
        placeholder="Qty"
        className="text-sm h-8 text-center"
      />

      {/* Unit */}
      <Select
        value={ing.recipeUnit || "oz"}
        onValueChange={(v) => onChange(index, { recipeUnit: v })}
      >
        <SelectTrigger className="h-8 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {UNITS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
        </SelectContent>
      </Select>

      {/* Unit cost */}
      <div className="relative">
        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
        <Input
          type="number"
          min={0}
          step={0.001}
          value={ing.unitCost || ""}
          onChange={(e) => handleUnitCostChange(parseFloat(e.target.value) || 0)}
          placeholder="0.00"
          className="text-sm h-8 pl-5 text-right"
        />
      </div>

      {/* Ingredient cost (calculated) */}
      <div className="text-sm font-medium text-right pr-1">
        ${ing.ingredientCost.toFixed(2)}
      </div>

      {/* Remove */}
      <button
        type="button"
        onClick={() => onRemove(index)}
        className="h-8 w-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
      >
        <X size={14} />
      </button>
    </div>
  );
}

// ── Cost summary panel ─────────────────────────────────────────────────────
function CostPanel({
  ingredients, qFactor, standardYield, actualMenuPrice, desiredCostPct,
  onQFactor, onDesiredCostPct, onActualMenuPrice,
}: {
  ingredients: RecipeIngredient[];
  qFactor: number;
  standardYield: number;
  actualMenuPrice: number;
  desiredCostPct: number;
  onQFactor: (v: number) => void;
  onDesiredCostPct: (v: number) => void;
  onActualMenuPrice: (v: number) => void;
}) {
  const { totalIngredientCost, recipeCost, portionCost, prelimMenuPrice, actualCostPct, profitAfterFoodCost } = calcCosts(ingredients, qFactor, standardYield, actualMenuPrice, desiredCostPct);

  const costPctColor = actualMenuPrice > 0
    ? actualCostPct <= 0.28 ? "text-green-600 dark:text-green-400"
    : actualCostPct <= 0.35 ? "text-yellow-600 dark:text-yellow-400"
    : "text-red-600 dark:text-red-400"
    : "text-foreground";

  return (
    <div className="bg-card border border-border rounded-xl p-5 space-y-3 sticky top-20">
      <h3 className="font-semibold text-sm">Cost Summary</h3>

      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Total Ingredient Cost</span>
          <span className="font-medium">${totalIngredientCost.toFixed(2)}</span>
        </div>

        {/* Q Factor row */}
        <div className="flex justify-between items-center gap-2">
          <span className="text-muted-foreground">Q Factor (waste %)</span>
          <div className="flex items-center gap-1">
            <Input
              type="number" min={0} max={0.5} step={0.01}
              value={(qFactor * 100).toFixed(0)}
              onChange={(e) => onQFactor((parseFloat(e.target.value) || 0) / 100)}
              className="h-6 w-14 text-xs text-right p-1"
            />
            <span className="text-xs text-muted-foreground">%</span>
          </div>
        </div>

        <div className="flex justify-between border-t border-border pt-2">
          <span className="text-muted-foreground">Recipe Cost</span>
          <span className="font-medium">${recipeCost.toFixed(2)}</span>
        </div>

        <div className="flex justify-between font-semibold">
          <span>Portion Cost</span>
          <span className="text-primary">${portionCost.toFixed(2)}</span>
        </div>

        <div className="border-t border-border pt-2 space-y-2">
          {/* Desired cost % */}
          <div className="flex justify-between items-center gap-2">
            <span className="text-muted-foreground">Desired Cost %</span>
            <div className="flex items-center gap-1">
              <Input
                type="number" min={1} max={100} step={1}
                value={(desiredCostPct * 100).toFixed(0)}
                onChange={(e) => onDesiredCostPct((parseFloat(e.target.value) || 25) / 100)}
                className="h-6 w-14 text-xs text-right p-1"
              />
              <span className="text-xs text-muted-foreground">%</span>
            </div>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Target Menu Price</span>
            <span className="font-medium">${prelimMenuPrice.toFixed(2)}</span>
          </div>
        </div>

        <div className="border-t border-border pt-2 space-y-2">
          {/* Actual menu price */}
          <div className="flex justify-between items-center gap-2">
            <span className="text-muted-foreground">Actual Menu Price</span>
            <div className="relative">
              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
              <Input
                type="number" min={0} step={0.25}
                value={actualMenuPrice || ""}
                onChange={(e) => onActualMenuPrice(parseFloat(e.target.value) || 0)}
                placeholder="0.00"
                className="h-6 w-20 text-xs text-right pl-5 pr-1"
              />
            </div>
          </div>
          {actualMenuPrice > 0 && (
            <>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Actual Cost %</span>
                <span className={`font-semibold ${costPctColor}`}>{(actualCostPct * 100).toFixed(1)}%</span>
              </div>
              <div className="flex justify-between font-semibold">
                <span>Profit After Food Cost</span>
                <span className="text-green-600 dark:text-green-400">${profitAfterFoodCost.toFixed(2)}</span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main form page ─────────────────────────────────────────────────────────
export default function RecipeFormPage() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isEdit = !!params.id && params.id !== "new";
  const token = localStorage.getItem("auth_token") || "";

  // Form state
  const [name, setName] = useState("");
  const [classification, setClassification] = useState("");
  const [standardPortion, setStandardPortion] = useState("");
  const [standardYield, setStandardYield] = useState(1);
  const [qFactor, setQFactor] = useState(0.03);
  const [desiredCostPct, setDesiredCostPct] = useState(0.25);
  const [actualMenuPrice, setActualMenuPrice] = useState(0);
  const [methodOfPrep, setMethodOfPrep] = useState("");
  const [platingInstructions, setPlatingInstructions] = useState("");
  const [notes, setNotes] = useState("");
  const [allergens, setAllergens] = useState<string[]>([]);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [ingredients, setIngredients] = useState<RecipeIngredient[]>([]);
  const [saving, setSaving] = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load existing recipe if editing
  const { data: existing } = useQuery<Recipe>({
    queryKey: [`/api/recipes/${params.id}`],
    queryFn: () => apiRequest("GET", `/api/recipes/${params.id}`).then((r) => r.json()),
    enabled: isEdit,
  });

  useEffect(() => {
    if (existing) {
      setName(existing.name);
      setClassification(existing.classification || "");
      setStandardPortion(existing.standardPortion || "");
      setStandardYield(existing.standardYield);
      setQFactor(existing.qFactor);
      setDesiredCostPct(existing.desiredCostPct);
      setActualMenuPrice(existing.actualMenuPrice);
      setMethodOfPrep(existing.methodOfPreparation || "");
      setPlatingInstructions(existing.platingInstructions || "");
      setNotes(existing.notes || "");
      setAllergens(existing.allergens || []);
      setPhotoUrl(existing.photoUrl || null);
      setIngredients(existing.ingredients || []);
    }
  }, [existing]);

  function addIngredient() {
    setIngredients((prev) => [
      ...prev,
      { ingredientName: "", itemNumber: null, recipeQuantity: 0, recipeUnit: "oz", unitCost: 0, ingredientCost: 0, lineItemId: null },
    ]);
  }

  function updateIngredient(i: number, updated: Partial<RecipeIngredient>) {
    setIngredients((prev) => prev.map((ing, idx) => idx === i ? { ...ing, ...updated } : ing));
  }

  function removeIngredient(i: number) {
    setIngredients((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function uploadPhoto(file: File) {
    setPhotoUploading(true);
    try {
      const fd = new FormData();
      fd.append("photo", file);
      const res = await fetch(`${API_BASE}/api/recipes/photo`, {
        method: "POST",
        headers: { "x-auth-token": token },
        body: fd,
      });
      const data = await res.json();
      if (data.url) setPhotoUrl(data.url);
    } catch {
      toast({ title: "Photo upload failed", variant: "destructive" });
    } finally {
      setPhotoUploading(false);
    }
  }

  async function handleSave() {
    if (!name.trim()) {
      toast({ title: "Recipe name is required", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const body = {
        name: name.trim(),
        classification: classification || null,
        standardPortion: standardPortion || null,
        standardYield,
        qFactor,
        desiredCostPct,
        actualMenuPrice,
        methodOfPreparation: methodOfPrep || null,
        platingInstructions: platingInstructions || null,
        notes: notes || null,
        allergens,
        photoUrl,
        ingredients: ingredients.map((ing, i) => ({ ...ing, sortOrder: i })),
      };

      if (isEdit) {
        await apiRequest("PATCH", `/api/recipes/${params.id}`, body);
        toast({ title: "Recipe saved" });
      } else {
        const res = await apiRequest("POST", "/api/recipes", body);
        const created = await res.json();
        toast({ title: "Recipe created" });
        queryClient.invalidateQueries({ queryKey: ["/api/recipes"] });
        navigate(`/recipes/${created.id}`);
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["/api/recipes"] });
      queryClient.invalidateQueries({ queryKey: [`/api/recipes/${params.id}`] });
      navigate(`/recipes/${params.id}`);
    } catch {
      toast({ title: "Failed to save recipe", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  const restaurantId = Number(localStorage.getItem("restaurant_id")) || null;

  return (
    <div className="space-y-6 pb-12">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/recipes")} className="text-muted-foreground hover:text-foreground transition-colors">
            <ChevronLeft size={20} />
          </button>
          <h1 className="text-xl font-bold tracking-tight">
            {isEdit ? "Edit Recipe" : "New Recipe Cost Card"}
          </h1>
        </div>
        <Button onClick={handleSave} disabled={saving} className="gap-1.5">
          <Save size={14} />
          {saving ? "Saving…" : "Save Recipe"}
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6">
        {/* Left — main form */}
        <div className="space-y-6">

          {/* Header info card */}
          <div className="bg-card border border-border rounded-xl p-5 space-y-4">
            <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">Recipe Info</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="text-xs text-muted-foreground font-medium mb-1.5 block">Recipe Name *</label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Pan-Seared Salmon" className="font-medium" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground font-medium mb-1.5 block">Classification</label>
                <Select value={classification} onValueChange={setClassification}>
                  <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                  <SelectContent>
                    {CLASSIFICATIONS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground font-medium mb-1.5 block">Standard Portion</label>
                <Input value={standardPortion} onChange={(e) => setStandardPortion(e.target.value)} placeholder="e.g. 6 oz" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground font-medium mb-1.5 block">Standard Yield (portions)</label>
                <Input
                  type="number" min={1} step={1}
                  value={standardYield}
                  onChange={(e) => setStandardYield(parseFloat(e.target.value) || 1)}
                />
              </div>
            </div>
          </div>

          {/* Photo */}
          <div className="bg-card border border-border rounded-xl p-5 space-y-3">
            <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">Dish Photo</h2>
            <div
              className="border-2 border-dashed border-border rounded-lg overflow-hidden cursor-pointer hover:border-primary/40 transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              {photoUrl ? (
                <div className="relative">
                  <img src={photoUrl} alt="Dish" className="w-full h-52 object-cover" />
                  <div className="absolute inset-0 bg-black/40 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center">
                    <span className="text-white text-sm font-medium">Change Photo</span>
                  </div>
                </div>
              ) : (
                <div className="h-40 flex flex-col items-center justify-center gap-2 text-muted-foreground">
                  <Camera size={28} />
                  <span className="text-sm">{photoUploading ? "Uploading…" : "Click to upload dish photo"}</span>
                </div>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && uploadPhoto(e.target.files[0])}
            />
          </div>

          {/* Ingredients */}
          <div className="bg-card border border-border rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">Ingredients</h2>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Search size={11} />
                <span>Type to search your invoice items</span>
              </div>
            </div>

            {/* Column headers */}
            <div className="grid grid-cols-[1fr_80px_100px_90px_90px_32px] gap-2 text-xs text-muted-foreground font-medium px-0.5">
              <span>Ingredient</span>
              <span className="text-center">Qty</span>
              <span>Unit</span>
              <span className="text-right">Unit Cost</span>
              <span className="text-right">Ing. Cost</span>
              <span></span>
            </div>

            <div className="space-y-2">
              {ingredients.map((ing, i) => (
                <IngredientRow
                  key={i}
                  ing={ing}
                  index={i}
                  onChange={updateIngredient}
                  onRemove={removeIngredient}
                  restaurantId={restaurantId}
                />
              ))}
            </div>

            <Button variant="outline" size="sm" onClick={addIngredient} className="gap-1.5 w-full">
              <Plus size={14} />
              Add Ingredient
            </Button>
          </div>

          {/* Method of Preparation */}
          <div className="bg-card border border-border rounded-xl p-5 space-y-3">
            <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">Method of Preparation</h2>
            <Textarea
              value={methodOfPrep}
              onChange={(e) => setMethodOfPrep(e.target.value)}
              placeholder="Step-by-step preparation instructions…"
              rows={6}
              className="resize-none"
            />
          </div>

          {/* Plating Instructions */}
          <div className="bg-card border border-border rounded-xl p-5 space-y-3">
            <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">Plating Instructions</h2>
            <Textarea
              value={platingInstructions}
              onChange={(e) => setPlatingInstructions(e.target.value)}
              placeholder="How to plate and garnish this dish…"
              rows={4}
              className="resize-none"
            />
          </div>

          {/* Allergens */}
          <div className="bg-card border border-border rounded-xl p-5 space-y-3">
            <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">Allergens</h2>
            <div className="flex flex-wrap gap-2">
              {ALLERGENS.map((a) => {
                const active = allergens.includes(a);
                return (
                  <button
                    key={a}
                    type="button"
                    onClick={() => setAllergens((prev) => active ? prev.filter((x) => x !== a) : [...prev, a])}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                      active
                        ? "bg-destructive/10 border-destructive/40 text-destructive"
                        : "border-border bg-background text-muted-foreground hover:border-primary/30 hover:text-foreground"
                    }`}
                  >
                    {a}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Notes */}
          <div className="bg-card border border-border rounded-xl p-5 space-y-3">
            <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">Additional Notes</h2>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any additional notes, storage instructions, substitutions…"
              rows={3}
              className="resize-none"
            />
          </div>
        </div>

        {/* Right — cost summary panel */}
        <div>
          <CostPanel
            ingredients={ingredients}
            qFactor={qFactor}
            standardYield={standardYield}
            actualMenuPrice={actualMenuPrice}
            desiredCostPct={desiredCostPct}
            onQFactor={setQFactor}
            onDesiredCostPct={setDesiredCostPct}
            onActualMenuPrice={setActualMenuPrice}
          />
        </div>
      </div>
    </div>
  );
}
