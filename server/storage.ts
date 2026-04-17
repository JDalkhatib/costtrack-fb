import supabase from "./supabase";
import type {
  Invoice,
  InsertInvoice,
  LineItem,
  InsertLineItem,
} from "@shared/schema";

// ── Row types from Supabase (snake_case) ─────────────────
interface InvoiceRow {
  id: number;
  invoice_number: string;
  vendor: string;
  invoice_date: string;
  notes: string | null;
  created_at: string;
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

// ── Mappers: DB row → app type ────────────────────────────
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

// ── Storage interface ─────────────────────────────────────
export interface IStorage {
  getInvoices(): Promise<Invoice[]>;
  getInvoice(id: number): Promise<Invoice | undefined>;
  createInvoice(invoice: InsertInvoice): Promise<Invoice>;
  updateInvoice(id: number, invoice: Partial<InsertInvoice>): Promise<Invoice | undefined>;
  deleteInvoice(id: number): Promise<void>;

  getLineItems(invoiceId: number): Promise<LineItem[]>;
  getAllLineItems(): Promise<LineItem[]>;
  getLineItem(id: number): Promise<LineItem | undefined>;
  createLineItem(item: InsertLineItem): Promise<LineItem>;
  updateLineItem(id: number, item: Partial<InsertLineItem>): Promise<LineItem | undefined>;
  deleteLineItem(id: number): Promise<void>;
}

// ── Supabase implementation ───────────────────────────────
class SupabaseStorage implements IStorage {
  async getInvoices(): Promise<Invoice[]> {
    const { data, error } = await supabase
      .from("invoices")
      .select("*")
      .order("id", { ascending: false });
    if (error) throw new Error(error.message);
    return (data as InvoiceRow[]).map(mapInvoice);
  }

  async getInvoice(id: number): Promise<Invoice | undefined> {
    const { data, error } = await supabase
      .from("invoices")
      .select("*")
      .eq("id", id)
      .single();
    if (error) return undefined;
    return mapInvoice(data as InvoiceRow);
  }

  async createInvoice(invoice: InsertInvoice): Promise<Invoice> {
    const { data, error } = await supabase
      .from("invoices")
      .insert({
        invoice_number: invoice.invoiceNumber,
        vendor: invoice.vendor,
        invoice_date: invoice.invoiceDate,
        notes: invoice.notes ?? null,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return mapInvoice(data as InvoiceRow);
  }

  async updateInvoice(id: number, data: Partial<InsertInvoice>): Promise<Invoice | undefined> {
    const update: Record<string, unknown> = {};
    if (data.invoiceNumber !== undefined) update.invoice_number = data.invoiceNumber;
    if (data.vendor !== undefined) update.vendor = data.vendor;
    if (data.invoiceDate !== undefined) update.invoice_date = data.invoiceDate;
    if (data.notes !== undefined) update.notes = data.notes;

    const { data: row, error } = await supabase
      .from("invoices")
      .update(update)
      .eq("id", id)
      .select()
      .single();
    if (error) return undefined;
    return mapInvoice(row as InvoiceRow);
  }

  async deleteInvoice(id: number): Promise<void> {
    // line_items cascade deletes via FK
    await supabase.from("invoices").delete().eq("id", id);
  }

  async getLineItems(invoiceId: number): Promise<LineItem[]> {
    const { data, error } = await supabase
      .from("line_items")
      .select("*")
      .eq("invoice_id", invoiceId);
    if (error) throw new Error(error.message);
    return (data as LineItemRow[]).map(mapLineItem);
  }

  async getAllLineItems(): Promise<LineItem[]> {
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
}

export const storage = new SupabaseStorage();
