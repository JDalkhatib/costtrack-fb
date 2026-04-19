import type { Express, Request } from "express";
import type { Server } from "http";
import multer from "multer";
import path from "path";
import fs from "fs";
import { storage } from "./storage";
import { insertInvoiceSchema, insertLineItemSchema } from "@shared/schema";
import { parsePdfInvoice } from "./pdfParser";
import { generateInvoiceWorkbook } from "./excelExport";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    cb(null, file.mimetype === "application/pdf");
  },
});

// Photo upload — accepts images, stores to disk under /uploads
const UPLOADS_DIR = path.join(process.cwd(), "uploads");
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
const photoUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname) || ".jpg";
      cb(null, `photo-${Date.now()}${ext}`);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    cb(null, file.mimetype.startsWith("image/"));
  },
});

// Helper: get restaurant scope from request
function rid(req: Request): number | null {
  return req.auth?.restaurantId ?? null;
}

export function registerRoutes(httpServer: Server, app: Express) {

  // ── PDF Parse ──────────────────────────────────────────────
  app.post("/api/parse-invoice-pdf", upload.single("file"), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: "No PDF file provided" });
      const result = await parsePdfInvoice(req.file.buffer);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err?.message ?? "Failed to parse PDF" });
    }
  });

  // ── Invoices ───────────────────────────────────────────────
  app.get("/api/invoices", async (req, res) => {
    try {
      const invoices = await storage.getInvoices(rid(req));
      res.json(invoices);
    } catch (err: any) {
      res.status(500).json({ error: err?.message });
    }
  });

  app.get("/api/invoices/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const invoice = await storage.getInvoice(id, rid(req));
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
      const invoice = await storage.createInvoice(parsed.data, rid(req));
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
      const updated = await storage.updateInvoice(id, partial.data, rid(req));
      if (!updated) return res.status(404).json({ error: "Invoice not found" });
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ error: err?.message });
    }
  });

  app.delete("/api/invoices/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteInvoice(id, rid(req));
      res.status(204).send();
    } catch (err: any) {
      res.status(500).json({ error: err?.message });
    }
  });

  // ── Line Items ─────────────────────────────────────────────
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

  app.get("/api/items", async (req, res) => {
    try {
      const items = await storage.getAllLineItems(rid(req));
      res.json(items);
    } catch (err: any) {
      res.status(500).json({ error: err?.message });
    }
  });

  // ── Restaurant Management (admin only) ────────────────────
  app.get("/api/admin/restaurants", async (req, res) => {
    try {
      if (!req.auth?.isAdmin) return res.status(403).json({ error: "Admin only" });
      const restaurants = await storage.getRestaurants();
      res.json(restaurants);
    } catch (err: any) {
      res.status(500).json({ error: err?.message });
    }
  });

  app.post("/api/admin/restaurants", async (req, res) => {
    try {
      if (!req.auth?.isAdmin) return res.status(403).json({ error: "Admin only" });
      const { name, password } = req.body;
      if (!name || !password) return res.status(400).json({ error: "name and password required" });
      const restaurant = await storage.createRestaurant(name, password);
      res.status(201).json(restaurant);
    } catch (err: any) {
      res.status(500).json({ error: err?.message });
    }
  });

  app.patch("/api/admin/restaurants/:id", async (req, res) => {
    try {
      if (!req.auth?.isAdmin) return res.status(403).json({ error: "Admin only" });
      const id = parseInt(req.params.id);
      const { name, password, active, gmailUser, gmailAppPassword } = req.body;
      const updated = await storage.updateRestaurant(id, { name, password, active, gmailUser, gmailAppPassword });
      if (!updated) return res.status(404).json({ error: "Restaurant not found" });
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ error: err?.message });
    }
  });

  app.delete("/api/admin/restaurants/:id", async (req, res) => {
    try {
      if (!req.auth?.isAdmin) return res.status(403).json({ error: "Admin only" });
      const id = parseInt(req.params.id);
      await storage.deleteRestaurant(id);
      res.status(204).send();
    } catch (err: any) {
      res.status(500).json({ error: err?.message });
    }
  });

  // ── Recent Auto-Imports ────────────────────────────────────
  app.get("/api/auto-imports/recent", async (req, res) => {
    try {
      const sb = (await import("./supabase")).default;
      let q = sb
        .from("processed_emails")
        .select("id, subject, sender, received_at, invoice_id, status, error_message")
        .eq("status", "processed")
        .order("received_at", { ascending: false })
        .limit(10);
      const { data, error } = await q;
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
      const history = await storage.getPriceHistory(itemName, rid(req));
      res.json(history);
    } catch (err: any) {
      res.status(500).json({ error: err?.message });
    }
  });

  // ── Recipes ────────────────────────────────────────────────
  app.get("/api/recipes", async (req, res) => {
    try {
      const recipes = await storage.getRecipes(rid(req));
      res.json(recipes);
    } catch (err: any) {
      res.status(500).json({ error: err?.message });
    }
  });

  // IMPORTANT: static sub-routes must come BEFORE /:id to avoid Express swallowing them
  app.get("/api/recipes/ingredients/search", async (req, res) => {
    try {
      const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
      if (!q) return res.json([]);
      const results = await storage.searchIngredients(q, rid(req));
      res.json(results);
    } catch (err: any) {
      res.status(500).json({ error: err?.message });
    }
  });

  // Photo upload for recipe dish images
  app.post("/api/recipes/photo", photoUpload.single("photo"), (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: "No image provided" });
      const url = `/uploads/${req.file.filename}`;
      res.json({ url });
    } catch (err: any) {
      res.status(500).json({ error: err?.message });
    }
  });

  app.get("/api/recipes/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const recipe = await storage.getRecipe(id, rid(req));
      if (!recipe) return res.status(404).json({ error: "Recipe not found" });
      res.json(recipe);
    } catch (err: any) {
      res.status(500).json({ error: err?.message });
    }
  });

  app.post("/api/recipes", async (req, res) => {
    try {
      const restaurantId = rid(req);
      if (!restaurantId) return res.status(400).json({ error: "Restaurant context required" });
      const { ingredients, ...recipeData } = req.body;
      const recipe = await storage.createRecipe(recipeData, restaurantId);
      if (ingredients && Array.isArray(ingredients)) {
        const ings = await storage.upsertRecipeIngredients(recipe.id, ingredients);
        return res.status(201).json({ ...recipe, ingredients: ings });
      }
      res.status(201).json(recipe);
    } catch (err: any) {
      res.status(500).json({ error: err?.message });
    }
  });

  app.patch("/api/recipes/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { ingredients, ...recipeData } = req.body;
      const updated = await storage.updateRecipe(id, recipeData, rid(req));
      if (!updated) return res.status(404).json({ error: "Recipe not found" });
      if (ingredients && Array.isArray(ingredients)) {
        const ings = await storage.upsertRecipeIngredients(id, ingredients);
        return res.json({ ...updated, ingredients: ings });
      }
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ error: err?.message });
    }
  });

  app.delete("/api/recipes/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteRecipe(id, rid(req));
      res.status(204).send();
    } catch (err: any) {
      res.status(500).json({ error: err?.message });
    }
  });

  // Serve uploaded photos
  app.use("/uploads", (req, res, next) => {
    const filePath = path.join(UPLOADS_DIR, path.basename(req.path));
    if (fs.existsSync(filePath)) {
      res.sendFile(filePath);
    } else {
      next();
    }
  });

  // ── Excel Export ───────────────────────────────────────────
  app.get("/api/export", async (req, res) => {
    try {
      const month = typeof req.query.month === "string" && req.query.month ? req.query.month : null;
      const invoices = await storage.getInvoices(rid(req));
      const allItems = await storage.getAllLineItems(rid(req));
      const buffer = await generateInvoiceWorkbook(invoices, allItems, month);
      const monthLabel = month ? `_${month}` : "_all-time";
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="costtrack-spend${monthLabel}.xlsx"`);
      res.send(buffer);
    } catch (err: any) {
      res.status(500).json({ error: err?.message ?? "Failed to generate export" });
    }
  });
}
