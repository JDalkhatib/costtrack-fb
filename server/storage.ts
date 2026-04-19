import supabase from "./supabase";
import type {
  Invoice,
  InsertInvoice,
  LineItem,
  InsertLineItem,
} from "@shared/schema";

// ── Row types from Supabase (snake_case) ──────────────────────
interface InvoiceRow {
  id: number;
  invoice_number: string;
  vendor: string;
  invoice_date: string;
  notes: string | null;
  created_at: string;
  restaurant_id: number | null;
}

interface LineItemRow {
  id: number;
  invoice_id: number;
  item_name: string;
  category: string;
  total_cost: number;
  quantity: number;
  unit: string;
  pack_size: number | null;
  pack_unit: string | null;
  notes: string | null;
}

export interface Restaurant {
  id: number;
  name: string;
  active: boolean;
  createdAt: string;
  gmailUser?: string | null;
  gmailAppPassword?: string | null;
}

// ── Mappers ────────────────────────────────────────────────────
function mapInvoice(r: InvoiceRow): Invoice {
  return {
    id: r.id,
    invoiceNumber: r.invoice_number,
    vendor: r.vendor,
    invoiceDate: r.invoice_date,
    notes: r.notes ?? null,
    createdAt: r.created_at,
  };
}

function mapLineItem(r: LineItemRow): LineItem {
  return {
    id: r.id,
    invoiceId: r.invoice_id,
    itemName: r.item_name,
    category: r.category,
    totalCost: Number(r.total_cost),
    quantity: Number(r.quantity),
    unit: r.unit,
    packSize: r.pack_size != null ? Number(r.pack_size) : null,
    packUnit: r.pack_unit ?? null,
    notes: r.notes ?? null,
  };
}

// ── Price history type ─────────────────────────────────────────
export interface PriceHistoryEntry {
  invoiceId: number;
  invoiceNumber: string;
  vendor: string;
  invoiceDate: string;
  costPerUnit: number;
  packUnit: string | null;
  totalCost: number;
  quantity: number;
  packSize: number | null;
}

// ── Storage interface ──────────────────────────────────────────
// restaurantId: null = admin (no filter), number = scoped to that restaurant
export interface IStorage {
  getInvoices(restaurantId: number | null): Promise<Invoice[]>;
  getInvoice(id: number, restaurantId: number | null): Promise<Invoice | undefined>;
  createInvoice(invoice: InsertInvoice, restaurantId: number | null): Promise<Invoice>;
  updateInvoice(id: number, invoice: Partial<InsertInvoice>, restaurantId: number | null): Promise<Invoice | undefined>;
  deleteInvoice(id: number, restaurantId: number | null): Promise<void>;

  getLineItems(invoiceId: number): Promise<LineItem[]>;
  getAllLineItems(restaurantId: number | null): Promise<LineItem[]>;
  getLineItem(id: number): Promise<LineItem | undefined>;
  createLineItem(item: InsertLineItem): Promise<LineItem>;
  updateLineItem(id: number, item: Partial<InsertLineItem>): Promise<LineItem | undefined>;
  deleteLineItem(id: number): Promise<void>;

  getPriceHistory(itemName: string, restaurantId: number | null): Promise<PriceHistoryEntry[]>;

  // Restaurant management (admin only)
  getRestaurants(): Promise<Restaurant[]>;
  createRestaurant(name: string, password: string): Promise<Restaurant>;
  updateRestaurant(id: number, data: { name?: string; password?: string; active?: boolean }): Promise<Restaurant | undefined>;
  deleteRestaurant(id: number): Promise<void>;

  // Recipes
  getRecipes(restaurantId: number | null): Promise<Recipe[]>;
  getRecipe(id: number, restaurantId: number | null): Promise<Recipe | undefined>;
  createRecipe(recipe: InsertRecipe, restaurantId: number): Promise<Recipe>;
  updateRecipe(id: number, recipe: Partial<InsertRecipe>, restaurantId: number | null): Promise<Recipe | undefined>;
  deleteRecipe(id: number, restaurantId: number | null): Promise<void>;
  upsertRecipeIngredients(recipeId: number, ingredients: InsertRecipeIngredient[]): Promise<RecipeIngredient[]>;
  searchIngredients(query: string, restaurantId: number | null): Promise<{ id: number; name: string; unit: string; unitCost: number; packSize: number | null; packUnit: string | null }[]>;
}

// ── Supabase implementation ────────────────────────────────────
class SupabaseStorage implements IStorage {

  // ── Invoices ────────────────────────────────────────────────

  async getInvoices(restaurantId: number | null): Promise<Invoice[]> {
    let q = supabase.from("invoices").select("*").order("id", { ascending: false });
    if (restaurantId !== null) q = q.eq("restaurant_id", restaurantId);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return (data as InvoiceRow[]).map(mapInvoice);
  }

  async getInvoice(id: number, restaurantId: number | null): Promise<Invoice | undefined> {
    let q = supabase.from("invoices").select("*").eq("id", id);
    if (restaurantId !== null) q = q.eq("restaurant_id", restaurantId);
    const { data, error } = await q.single();
    if (error) return undefined;
    return mapInvoice(data as InvoiceRow);
  }

  async createInvoice(invoice: InsertInvoice, restaurantId: number | null): Promise<Invoice> {
    const { data, error } = await supabase
      .from("invoices")
      .insert({
        invoice_number: invoice.invoiceNumber,
        vendor: invoice.vendor,
        invoice_date: invoice.invoiceDate,
        notes: invoice.notes ?? null,
        created_at: new Date().toISOString(),
        restaurant_id: restaurantId,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return mapInvoice(data as InvoiceRow);
  }

  async updateInvoice(id: number, data: Partial<InsertInvoice>, restaurantId: number | null): Promise<Invoice | undefined> {
    const update: Record<string, unknown> = {};
    if (data.invoiceNumber !== undefined) update.invoice_number = data.invoiceNumber;
    if (data.vendor !== undefined) update.vendor = data.vendor;
    if (data.invoiceDate !== undefined) update.invoice_date = data.invoiceDate;
    if (data.notes !== undefined) update.notes = data.notes;

    let q = supabase.from("invoices").update(update).eq("id", id);
    if (restaurantId !== null) q = q.eq("restaurant_id", restaurantId);
    const { data: row, error } = await q.select().single();
    if (error) return undefined;
    return mapInvoice(row as InvoiceRow);
  }

  async deleteInvoice(id: number, restaurantId: number | null): Promise<void> {
    let q = supabase.from("invoices").delete().eq("id", id);
    if (restaurantId !== null) q = q.eq("restaurant_id", restaurantId);
    await q;
  }

  // ── Line Items ───────────────────────────────────────────────

  async getLineItems(invoiceId: number): Promise<LineItem[]> {
    const { data, error } = await supabase
      .from("line_items")
      .select("*")
      .eq("invoice_id", invoiceId);
    if (error) throw new Error(error.message);
    return (data as LineItemRow[]).map(mapLineItem);
  }

  async getAllLineItems(restaurantId: number | null): Promise<LineItem[]> {
    if (restaurantId !== null) {
      // Join through invoices to filter by restaurant
      const { data, error } = await supabase
        .from("line_items")
        .select("*, invoices!inner(restaurant_id)")
        .eq("invoices.restaurant_id", restaurantId);
      if (error) throw new Error(error.message);
      return (data as any[]).map(mapLineItem);
    }
    const { data, error } = await supabase.from("line_items").select("*");
    if (error) throw new Error(error.message);
    return (data as LineItemRow[]).map(mapLineItem);
  }

  async getLineItem(id: number): Promise<LineItem | undefined> {
    const { data, error } = await supabase
      .from("line_items")
      .select("*")
      .eq("id", id)
      .single();
    if (error) return undefined;
    return mapLineItem(data as LineItemRow);
  }

  async createLineItem(item: InsertLineItem): Promise<LineItem> {
    const { data, error } = await supabase
      .from("line_items")
      .insert({
        invoice_id: item.invoiceId,
        item_name: item.itemName,
        category: item.category,
        total_cost: item.totalCost,
        quantity: item.quantity,
        unit: item.unit,
        pack_size: item.packSize ?? null,
        pack_unit: item.packUnit ?? null,
        notes: item.notes ?? null,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return mapLineItem(data as LineItemRow);
  }

  async updateLineItem(id: number, data: Partial<InsertLineItem>): Promise<LineItem | undefined> {
    const update: Record<string, unknown> = {};
    if (data.itemName !== undefined) update.item_name = data.itemName;
    if (data.category !== undefined) update.category = data.category;
    if (data.totalCost !== undefined) update.total_cost = data.totalCost;
    if (data.quantity !== undefined) update.quantity = data.quantity;
    if (data.unit !== undefined) update.unit = data.unit;
    if (data.packSize !== undefined) update.pack_size = data.packSize;
    if (data.packUnit !== undefined) update.pack_unit = data.packUnit;
    if (data.notes !== undefined) update.notes = data.notes;

    const { data: row, error } = await supabase
      .from("line_items")
      .update(update)
      .eq("id", id)
      .select()
      .single();
    if (error) return undefined;
    return mapLineItem(row as LineItemRow);
  }

  async deleteLineItem(id: number): Promise<void> {
    await supabase.from("line_items").delete().eq("id", id);
  }

  // ── Price History ────────────────────────────────────────────

  async getPriceHistory(itemName: string, restaurantId: number | null): Promise<PriceHistoryEntry[]> {
    let q = supabase
      .from("line_items")
      .select(`
        id, item_name, total_cost, quantity, pack_size, pack_unit,
        invoices!inner ( id, invoice_number, vendor, invoice_date, restaurant_id )
      `)
      .ilike("item_name", `%${itemName.trim()}%`)
      .order("id", { ascending: false })
      .limit(20);

    if (restaurantId !== null) {
      q = q.eq("invoices.restaurant_id", restaurantId);
    }

    const { data, error } = await q;
    if (error) throw new Error(error.message);

    return ((data as any[]) ?? []).map((row) => {
      const packSize = row.pack_size ? Number(row.pack_size) : null;
      const quantity = Number(row.quantity);
      const totalCost = Number(row.total_cost);
      const totalUnits = packSize && packSize > 0 ? quantity * packSize : quantity;
      const costPerUnit = totalUnits > 0 ? totalCost / totalUnits : 0;
      const inv = row.invoices;
      return {
        invoiceId: inv.id,
        invoiceNumber: inv.invoice_number,
        vendor: inv.vendor,
        invoiceDate: inv.invoice_date,
        costPerUnit,
        packUnit: row.pack_unit ?? null,
        totalCost,
        quantity,
        packSize,
      };
    });
  }

  // ── Restaurants ──────────────────────────────────────────────

  async getRestaurants(): Promise<Restaurant[]> {
    const { data, error } = await supabase
      .from("restaurants")
      .select("id, name, active, created_at, gmail_user, gmail_app_password")
      .order("name");
    if (error) throw new Error(error.message);
    return (data ?? []).map((r: any) => ({
      id: r.id,
      name: r.name,
      active: r.active,
      createdAt: r.created_at,
      gmailUser: r.gmail_user ?? null,
      gmailAppPassword: r.gmail_app_password ?? null,
    }));
  }

  async createRestaurant(name: string, password: string): Promise<Restaurant> {
    const { data, error } = await supabase
      .from("restaurants")
      .insert({ name, password_hash: password, active: true })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return { id: data.id, name: data.name, active: data.active, createdAt: data.created_at };
  }

  async updateRestaurant(id: number, update: { name?: string; password?: string; active?: boolean; gmailUser?: string | null; gmailAppPassword?: string | null }): Promise<Restaurant | undefined> {
    const row: Record<string, unknown> = {};
    if (update.name !== undefined) row.name = update.name;
    if (update.password !== undefined) row.password_hash = update.password;
    if (update.active !== undefined) row.active = update.active;
    if (update.gmailUser !== undefined) row.gmail_user = update.gmailUser;
    if (update.gmailAppPassword !== undefined) row.gmail_app_password = update.gmailAppPassword;

    const { data, error } = await supabase
      .from("restaurants")
      .update(row)
      .eq("id", id)
      .select()
      .single();
    if (error) return undefined;
    return {
      id: data.id, name: data.name, active: data.active, createdAt: data.created_at,
      gmailUser: data.gmail_user ?? null, gmailAppPassword: data.gmail_app_password ?? null,
    };
  }

  async deleteRestaurant(id: number): Promise<void> {
    await supabase.from("restaurants").delete().eq("id", id);
  }

  // ── Recipes ──────────────────────────────────────────────────

  async getRecipes(restaurantId: number | null): Promise<Recipe[]> {
    let q = supabase.from("recipes").select("*").order("name");
    if (restaurantId !== null) q = q.eq("restaurant_id", restaurantId);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return (data ?? []).map((r: any) => mapRecipe(r));
  }

  async getRecipe(id: number, restaurantId: number | null): Promise<Recipe | undefined> {
    let q = supabase.from("recipes").select("*").eq("id", id);
    if (restaurantId !== null) q = q.eq("restaurant_id", restaurantId);
    const { data, error } = await q.single();
    if (error) return undefined;
    const { data: ingData } = await supabase
      .from("recipe_ingredients")
      .select("*")
      .eq("recipe_id", id)
      .order("sort_order");
    const ingredients = (ingData ?? []).map(mapRecipeIngredient);
    return mapRecipe(data, ingredients);
  }

  async createRecipe(recipe: InsertRecipe, restaurantId: number): Promise<Recipe> {
    const { data, error } = await supabase
      .from("recipes")
      .insert({
        restaurant_id: restaurantId,
        name: recipe.name,
        classification: recipe.classification ?? null,
        standard_portion: recipe.standardPortion ?? null,
        standard_yield: recipe.standardYield ?? 1,
        method_of_preparation: recipe.methodOfPreparation ?? null,
        plating_instructions: recipe.platingInstructions ?? null,
        photo_url: recipe.photoUrl ?? null,
        notes: recipe.notes ?? null,
        desired_cost_pct: recipe.desiredCostPct ?? 0.25,
        actual_menu_price: recipe.actualMenuPrice ?? 0,
        q_factor: recipe.qFactor ?? 0.03,
        allergens: recipe.allergens ?? [],
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return mapRecipe(data, []);
  }

  async updateRecipe(id: number, recipe: Partial<InsertRecipe>, restaurantId: number | null): Promise<Recipe | undefined> {
    const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (recipe.name !== undefined) row.name = recipe.name;
    if (recipe.classification !== undefined) row.classification = recipe.classification;
    if (recipe.standardPortion !== undefined) row.standard_portion = recipe.standardPortion;
    if (recipe.standardYield !== undefined) row.standard_yield = recipe.standardYield;
    if (recipe.methodOfPreparation !== undefined) row.method_of_preparation = recipe.methodOfPreparation;
    if (recipe.platingInstructions !== undefined) row.plating_instructions = recipe.platingInstructions;
    if (recipe.photoUrl !== undefined) row.photo_url = recipe.photoUrl;
    if (recipe.notes !== undefined) row.notes = recipe.notes;
    if (recipe.desiredCostPct !== undefined) row.desired_cost_pct = recipe.desiredCostPct;
    if (recipe.actualMenuPrice !== undefined) row.actual_menu_price = recipe.actualMenuPrice;
    if (recipe.qFactor !== undefined) row.q_factor = recipe.qFactor;
    if (recipe.allergens !== undefined) row.allergens = recipe.allergens;
    let q = supabase.from("recipes").update(row).eq("id", id);
    if (restaurantId !== null) q = q.eq("restaurant_id", restaurantId);
    const { data, error } = await q.select().single();
    if (error) return undefined;
    return mapRecipe(data);
  }

  async deleteRecipe(id: number, restaurantId: number | null): Promise<void> {
    let q = supabase.from("recipes").delete().eq("id", id);
    if (restaurantId !== null) q = q.eq("restaurant_id", restaurantId);
    await q;
  }

  async upsertRecipeIngredients(recipeId: number, ingredients: InsertRecipeIngredient[]): Promise<RecipeIngredient[]> {
    // Delete existing and re-insert (clean replace)
    await supabase.from("recipe_ingredients").delete().eq("recipe_id", recipeId);
    if (ingredients.length === 0) return [];
    const rows = ingredients.map((ing, i) => ({
      recipe_id: recipeId,
      sort_order: ing.sortOrder ?? i,
      ingredient_name: ing.ingredientName,
      item_number: ing.itemNumber ?? null,
      recipe_quantity: ing.recipeQuantity ?? 0,
      recipe_unit: ing.recipeUnit ?? '',
      unit_cost: ing.unitCost ?? 0,
      ingredient_cost: ing.ingredientCost ?? 0,
      line_item_id: ing.lineItemId ?? null,
    }));
    const { data, error } = await supabase
      .from("recipe_ingredients")
      .insert(rows)
      .select();
    if (error) throw new Error(error.message);
    return (data ?? []).map(mapRecipeIngredient);
  }

  async searchIngredients(query: string, restaurantId: number | null) {
    // Search line_items matching the query. Include:
    // - invoices belonging to this restaurant
    // - invoices with no restaurant (legacy/shared invoices uploaded before multi-restaurant)
    // This ensures results always appear regardless of how invoices were imported.
    const { data, error } = await supabase
      .from("line_items")
      .select("id, item_name, unit, total_cost, quantity, pack_size, pack_unit, invoices!inner(id, restaurant_id, invoice_date)")
      .ilike("item_name", `%${query}%`)
      .order("id", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);

    // Filter client-side: keep rows where invoice restaurant_id matches OR is null
    const rows = ((data ?? []) as any[]).filter((row) => {
      const invRestaurantId = row.invoices?.restaurant_id ?? null;
      if (restaurantId === null) return true; // admin sees all
      return invRestaurantId === null || invRestaurantId === restaurantId;
    });

    // Deduplicate by item_name, keep most recent
    const seen = new Map<string, any>();
    for (const row of rows) {
      const key = row.item_name.toLowerCase().trim();
      if (!seen.has(key)) seen.set(key, row);
    }
    return Array.from(seen.values()).slice(0, 20).map((row) => {
      const qty = Number(row.quantity);
      const totalCost = Number(row.total_cost);
      const packSize = row.pack_size ? Number(row.pack_size) : null;
      const totalUnits = packSize && packSize > 0 ? qty * packSize : qty;
      const unitCost = totalUnits > 0 ? totalCost / totalUnits : 0;
      return {
        id: row.id,
        name: row.item_name,
        unit: row.pack_unit ?? row.unit ?? '',
        unitCost,
        packSize,
        packUnit: row.pack_unit ?? null,
      };
    });
  }
}

export const storage = new SupabaseStorage();

// ─────────────────────────────────────────────────────────────
// Recipe types
// ─────────────────────────────────────────────────────────────
export interface RecipeIngredient {
  id: number;
  recipeId: number;
  sortOrder: number;
  ingredientName: string;
  itemNumber: string | null;
  recipeQuantity: number;
  recipeUnit: string;
  unitCost: number;
  ingredientCost: number;
  lineItemId: number | null;
}

export interface Recipe {
  id: number;
  restaurantId: number;
  name: string;
  classification: string | null;
  standardPortion: string | null;
  standardYield: number;
  methodOfPreparation: string | null;
  platingInstructions: string | null;
  photoUrl: string | null;
  notes: string | null;
  desiredCostPct: number;
  actualMenuPrice: number;
  qFactor: number;
  allergens: string[];
  createdAt: string;
  updatedAt: string;
  ingredients?: RecipeIngredient[];
}

export interface InsertRecipe {
  name: string;
  classification?: string | null;
  standardPortion?: string | null;
  standardYield?: number;
  methodOfPreparation?: string | null;
  platingInstructions?: string | null;
  photoUrl?: string | null;
  notes?: string | null;
  desiredCostPct?: number;
  actualMenuPrice?: number;
  qFactor?: number;
  allergens?: string[];
}

export interface InsertRecipeIngredient {
  sortOrder?: number;
  ingredientName: string;
  itemNumber?: string | null;
  recipeQuantity?: number;
  recipeUnit?: string;
  unitCost?: number;
  ingredientCost?: number;
  lineItemId?: number | null;
}

function mapRecipeIngredient(r: any): RecipeIngredient {
  return {
    id: r.id,
    recipeId: r.recipe_id,
    sortOrder: r.sort_order ?? 0,
    ingredientName: r.ingredient_name,
    itemNumber: r.item_number ?? null,
    recipeQuantity: Number(r.recipe_quantity ?? 0),
    recipeUnit: r.recipe_unit ?? '',
    unitCost: Number(r.unit_cost ?? 0),
    ingredientCost: Number(r.ingredient_cost ?? 0),
    lineItemId: r.line_item_id ?? null,
  };
}

function mapRecipe(r: any, ingredients?: RecipeIngredient[]): Recipe {
  return {
    id: r.id,
    restaurantId: r.restaurant_id,
    name: r.name,
    classification: r.classification ?? null,
    standardPortion: r.standard_portion ?? null,
    standardYield: Number(r.standard_yield ?? 1),
    methodOfPreparation: r.method_of_preparation ?? null,
    platingInstructions: r.plating_instructions ?? null,
    photoUrl: r.photo_url ?? null,
    notes: r.notes ?? null,
    desiredCostPct: Number(r.desired_cost_pct ?? 0.25),
    actualMenuPrice: Number(r.actual_menu_price ?? 0),
    qFactor: Number(r.q_factor ?? 0.03),
    allergens: Array.isArray(r.allergens) ? r.allergens : [],
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    ingredients,
  };
}
