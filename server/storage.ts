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
}

export const storage = new SupabaseStorage();
