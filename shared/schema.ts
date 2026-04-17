import { sqliteTable, integer, text, real } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Categories enum
export const CATEGORIES = [
  "Meat & Seafood",
  "Produce",
  "Dairy & Eggs",
  "Bakery & Bread",
  "Dry Goods & Pantry",
  "Beverages",
  "Frozen",
  "Cleaning & Supplies",
  "Paper & Packaging",
  "Other",
] as const;

export type Category = (typeof CATEGORIES)[number];

// Units enum
export const UNITS = [
  "lb",
  "oz",
  "kg",
  "g",
  "each",
  "case",
  "dozen",
  "gallon",
  "quart",
  "pint",
  "liter",
  "fl oz",
  "bag",
  "box",
  "can",
  "bottle",
  "pack",
  "bunch",
  "tray",
  "sheet",
  "roll",
] as const;

export type Unit = (typeof UNITS)[number];

// Invoices table
export const invoices = sqliteTable("invoices", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  invoiceNumber: text("invoice_number").notNull(),
  vendor: text("vendor").notNull(),
  invoiceDate: text("invoice_date").notNull(),
  notes: text("notes"),
  createdAt: text("created_at").notNull(),
});

export const insertInvoiceSchema = createInsertSchema(invoices).omit({
  id: true,
  createdAt: true,
});

export type InsertInvoice = z.infer<typeof insertInvoiceSchema>;
export type Invoice = typeof invoices.$inferSelect;

// Line items table
export const lineItems = sqliteTable("line_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  invoiceId: integer("invoice_id").notNull(),
  itemName: text("item_name").notNull(),
  category: text("category").notNull(),
  totalCost: real("total_cost").notNull(),
  quantity: real("quantity").notNull(),
  unit: text("unit").notNull(),
  packSize: real("pack_size"),
  packUnit: text("pack_unit"),
  notes: text("notes"),
});

export const insertLineItemSchema = createInsertSchema(lineItems).omit({
  id: true,
});

export type InsertLineItem = z.infer<typeof insertLineItemSchema>;
export type LineItem = typeof lineItems.$inferSelect;

// Computed: cost per unit = totalCost / (quantity * packSize if applicable)
