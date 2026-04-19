import type { Express } from "express";
import type { Server } from "http";
import multer from "multer";
import { storage } from "./storage";
import { insertInvoiceSchema, insertLineItemSchema } from "@shared/schema";
import { parsePdfInvoice } from "./pdfParser";
import { generateInvoiceWorkbook } from "./excelExport";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
  fileFilter: (_req, file, cb) => {
    cb(null, file.mimetype === "application/pdf");
  },
});

export function registerRoutes(httpServer: Server, app: Express) {
  // ── PDF Parse (AI extraction) ─────────────────────────────
  app.post("/api/parse-invoice-pdf", upload.single("file"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No PDF file provided" });
      }
      const result = await parsePdfInvoice(req.file.buffer);
      res.json(result);
    } catch (err: any) {
      console.error("PDF parse error:", err);
      res.status(500).json({ error: err?.message ?? "Failed to parse PDF" });
    }
  });

  // ── Invoices ─────────────────────────────────────────────
  app.get("/api/invoices", async (_req, res) => {
    try {
      const invoices = await storage.getInvoices();
      res.json(invoices);
    } catch (err: any) {
      res.status(500).json({ error: err?.message });
    }
  });

  app.get("/api/invoices/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const invoice = await storage.getInvoice(id);
      if (!invoice) return res.status(404).json({ error: "Invoice not found" });
      const items = await storage.getLineItems(id);
      res.json({ ...invoice, items });
    } catch (err: any) {
      res.status(500).json({ error: err?.message });
    }
  });

  app.post("/api/invoices", async (req, res) => {
    try {
      const parsed = insertInvoiceSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: parsed.error });
      const invoice = await storage.createInvoice(parsed.data);
      res.status(201).json(invoice);
    } catch (err: any) {
      res.status(500).json({ error: err?.message });
    }
  });

  app.patch("/api/invoices/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const partial = insertInvoiceSchema.partial().safeParse(req.body);
      if (!partial.success) return res.status(400).json({ error: partial.error });
      const updated = await storage.updateInvoice(id, partial.data);
      if (!updated) return res.status(404).json({ error: "Invoice not found" });
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ error: err?.message });
    }
  });

  app.delete("/api/invoices/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteInvoice(id);
      res.status(204).send();
    } catch (err: any) {
      res.status(500).json({ error: err?.message });
    }
  });

  // ── Line Items ────────────────────────────────────────────
  app.get("/api/invoices/:id/items", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const items = await storage.getLineItems(id);
      res.json(items);
    } catch (err: any) {
      res.status(500).json({ error: err?.message });
    }
  });

  app.post("/api/invoices/:id/items", async (req, res) => {
    try {
      const invoiceId = parseInt(req.params.id);
      const parsed = insertLineItemSchema.safeParse({ ...req.body, invoiceId });
      if (!parsed.success) return res.status(400).json({ error: parsed.error });
      const item = await storage.createLineItem(parsed.data);
      res.status(201).json(item);
    } catch (err: any) {
      res.status(500).json({ error: err?.message });
    }
  });

  app.patch("/api/items/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const partial = insertLineItemSchema.partial().safeParse(req.body);
      if (!partial.success) return res.status(400).json({ error: partial.error });
      const updated = await storage.updateLineItem(id, partial.data);
      if (!updated) return res.status(404).json({ error: "Item not found" });
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ error: err?.message });
    }
  });

  app.delete("/api/items/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteLineItem(id);
      res.status(204).send();
    } catch (err: any) {
      res.status(500).json({ error: err?.message });
    }
  });

  // ── All items (for category view) ─────────────────────────
  app.get("/api/items", async (_req, res) => {
    try {
      const items = await storage.getAllLineItems();
      res.json(items);
    } catch (err: any) {
      res.status(500).json({ error: err?.message });
    }
  });

  // ── Recent Auto-Imports ────────────────────────────────────
  app.get("/api/auto-imports/recent", async (req, res) => {
    try {
      const sb = (await import("./supabase")).default;
      const { data, error } = await sb
        .from("processed_emails")
        .select("id, subject, sender, received_at, invoice_id, status, error_message")
        .eq("status", "processed")
        .order("received_at", { ascending: false })
        .limit(10);
      if (error) throw new Error(error.message);
      res.json(data ?? []);
    } catch (err: any) {
      res.status(500).json({ error: err?.message });
    }
  });

  // ── Price History ──────────────────────────────────────────
  app.get("/api/price-history", async (req, res) => {
    try {
      const itemName = typeof req.query.item === "string" ? req.query.item : "";
      if (!itemName.trim()) return res.status(400).json({ error: "item query param required" });
      const history = await storage.getPriceHistory(itemName);
      res.json(history);
    } catch (err: any) {
      res.status(500).json({ error: err?.message });
    }
  });

  // ── Excel Export ──────────────────────────────────────────
  app.get("/api/export", async (req, res) => {
    try {
      const month = typeof req.query.month === "string" && req.query.month ? req.query.month : null;
      const invoices = await storage.getInvoices();
      const allItems = await storage.getAllLineItems();
      const buffer = await generateInvoiceWorkbook(invoices, allItems, month);
      const monthLabel = month ? `_${month}` : "_all-time";
      const filename = `costtrack-spend${monthLabel}.xlsx`;
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(buffer);
    } catch (err: any) {
      console.error("Excel export error:", err);
      res.status(500).json({ error: err?.message ?? "Failed to generate export" });
    }
  });
}
