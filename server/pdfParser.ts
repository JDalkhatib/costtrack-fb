import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import os from "os";
import Anthropic from "@anthropic-ai/sdk";

const execAsync = promisify(exec);

interface ParsedLineItem {
  itemName: string;
  category: string;
  totalCost: number;
  quantity: number;
  unit: string;
  packSize?: number | null;
  packUnit?: string | null;
  notes?: string | null;
}

interface ParsedInvoice {
  vendor: string;
  invoiceNumber: string;
  invoiceDate: string; // YYYY-MM-DD
  notes?: string;
  items: ParsedLineItem[];
}

const CATEGORIES = [
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
];

const UNITS = [
  "lb", "oz", "kg", "g", "each", "case", "dozen",
  "gallon", "quart", "pint", "liter", "fl oz",
  "bag", "box", "can", "bottle", "pack", "bunch", "tray", "sheet", "roll",
];

// Unit alias map for normalizing pack units from invoice shorthand
const UNIT_ALIASES: Record<string, string> = {
  lb: "lb", lbs: "lb", pound: "lb", pounds: "lb",
  oz: "oz", ounce: "oz", ounces: "oz",
  gal: "gallon", gals: "gallon", gallon: "gallon", gallons: "gallon",
  qt: "quart", qts: "quart", quart: "quart",
  pt: "pint", pint: "pint",
  lt: "liter", ltr: "liter", liter: "liter",
  fl: "fl oz", floz: "fl oz",
  ct: "each", ea: "each", each: "each", count: "each", pc: "each",
  can: "can", cans: "can",
  bag: "bag", bags: "bag",
  box: "box", boxes: "box",
  btl: "bottle", bottle: "bottle", bottles: "bottle",
  pk: "pack", pack: "pack", packs: "pack",
  sh: "sheet", sheets: "sheet",
  rl: "roll", roll: "roll", rolls: "roll",
  dz: "dozen", dozen: "dozen",
  cs: "case",
};

function normalizeUnit(raw: string): string {
  const key = raw.toLowerCase().replace(/[^a-z]/g, "");
  return UNIT_ALIASES[key] ?? key;
}

/**
 * Normalizes complex packUnit strings like "bag of 10 lb" or "carton of 32 oz"
 * into a simple base unit, multiplying the weight/count into packSize.
 *
 * Examples:
 *   (1, "bag of 10 lb")   → { packSize: 10, packUnit: "lb" }
 *   (4, "tub of 5 lb")    → { packSize: 20, packUnit: "lb" }
 *   (12, "carton of 32 oz") → { packSize: 384, packUnit: "oz" }
 *   (1, "each of 3 oz")   → { packSize: 3, packUnit: "oz" }
 *   (2, "loaf of 6 lb")   → { packSize: 12, packUnit: "lb" }
 *   (2, "lb")             → { packSize: 2, packUnit: "lb" }  (already simple)
 */
export function normalizePackUnit(
  qty: number,         // quantity of cases/bags ordered
  packSize: number,    // raw packSize from Claude
  packUnit: string,    // raw packUnit from Claude (may be complex)
): { packSize: number; packUnit: string } {
  if (!packUnit) return { packSize, packUnit };

  const raw = packUnit.trim();

  // Already a simple base unit — no parsing needed
  const simpleUnits = new Set(["lb", "oz", "kg", "g", "each", "gallon", "quart", "pint",
    "liter", "fl oz", "can", "roll", "sheet", "dozen", "bottle", "bag", "box", "pack"]);
  if (simpleUnits.has(raw.toLowerCase())) return { packSize, packUnit: raw.toLowerCase() };

  // Try to parse "N <container> of M <unit>" or "<container> of M <unit>"
  // e.g. "bag of 10 lb", "tub of 5 lb", "carton of 32 oz", "each of 3 oz", "loaf of 12 oz"
  // Also handles "6 lb" (just a number + unit with no "of")
  const ofPattern = /^(?:\d+\s+\w+\s+of\s+)?(\d+\.?\d*)\s+([a-z]+)$/i;
  const match = raw.match(ofPattern);
  if (match) {
    const innerQty = parseFloat(match[1]);
    const baseUnit = normalizeUnit(match[2]);
    if (innerQty > 0 && baseUnit) {
      return {
        packSize: packSize * innerQty,
        packUnit: baseUnit,
      };
    }
  }

  // Try "pack of N" or "box of N" (count-based, no weight unit)
  const packOfPattern = /^(?:pack|box|set|bundle)\s+of\s+(\d+)$/i;
  const packOfMatch = raw.match(packOfPattern);
  if (packOfMatch) {
    return {
      packSize: packSize * parseFloat(packOfMatch[1]),
      packUnit: "each",
    };
  }

  // Try plain "N unit" without "of" — e.g. "32 oz", "5 lb"
  const plainPattern = /^(\d+\.?\d*)\s+([a-z]+)$/i;
  const plainMatch = raw.match(plainPattern);
  if (plainMatch) {
    const n = parseFloat(plainMatch[1]);
    const unit = normalizeUnit(plainMatch[2]);
    if (n > 0 && unit) {
      return { packSize: packSize * n, packUnit: unit };
    }
  }

  // Fallback: try to extract any unit word from the string
  const words = raw.toLowerCase().split(/\s+/);
  for (const w of words.reverse()) {
    const u = normalizeUnit(w);
    if (simpleUnits.has(u)) {
      const numMatch = raw.match(/(\d+\.?\d*)/);
      const n = numMatch ? parseFloat(numMatch[1]) : 1;
      return { packSize: packSize * n, packUnit: u };
    }
  }

  // Can't parse — return as-is
  return { packSize, packUnit: raw };
}

/**
 * Tries to extract pack size and unit from an item name/description.
 * Handles common foodservice formats:
 *   "4/1 GAL", "2/5 LB", "6/10 CAN", "12/24OZ", "36CT", "10 LB BAG", "1/30 LB"
 */
function extractPackFromName(name: string): { packSize: number; packUnit: string } | null {
  if (!name) return null;
  const n = name.toUpperCase();

  // Pattern 1: X/Y UNIT  — e.g. "4/1 GAL", "2/5 LB", "12/24 OZ", "6/10 CAN"
  // For X/Y format: if X=1, packSize = Y (single unit of Y weight/volume)
  // If X>1, packSize = Y per inner unit (cost per inner unit = total / qty / Y)
  // We use Y as the packSize and the unit as packUnit
  const slashPattern = /(\d+)\/(\d+\.?\d*)\s*([A-Z]+)/;
  const slashMatch = n.match(slashPattern);
  if (slashMatch) {
    const outer = parseFloat(slashMatch[1]);
    const inner = parseFloat(slashMatch[2]);
    const unit = normalizeUnit(slashMatch[3]);
    if (unit && unit !== "case") {
      // For "2/5 LB" (2 bags of 5 lb): packSize = total lbs = outer * inner
      // For "4/1 GAL" (4 jugs of 1 gal): packSize = 4 (gallons per case)
      // For "1/30 LB" (1 bag of 30 lb): packSize = 30
      const packSize = outer === 1 ? inner : (inner === 1 ? outer : outer * inner);
      return { packSize, packUnit: unit };
    }
  }

  // Pattern 2: NNct / NNCT / NN COUNT / NN EA  — e.g. "36CT", "24 COUNT", "12 EA"
  const countPattern = /(\d+)\s*(?:CT|COUNT|EA|PC|PCS|EACH)(?:\b|$)/;
  const countMatch = n.match(countPattern);
  if (countMatch) {
    return { packSize: parseFloat(countMatch[1]), packUnit: "each" };
  }

  // Pattern 3: NN UNIT BAG/BOX/CASE  — e.g. "10 LB BAG", "5 LB", "50 LB"
  const weightPattern = /(\d+\.?\d*)\s*(LB|LBS|OZ|GAL|GALLON|KG|LITER|LT)(?:\s+(?:BAG|BOX|CS|CASE))?(?:\b|$)/;
  const weightMatch = n.match(weightPattern);
  if (weightMatch) {
    const unit = normalizeUnit(weightMatch[2]);
    return { packSize: parseFloat(weightMatch[1]), packUnit: unit };
  }

  return null;
}

export async function parsePdfInvoice(pdfBuffer: Buffer): Promise<ParsedInvoice> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "invoice-"));
  const pdfPath = path.join(tmpDir, "invoice.pdf");
  const imgPrefix = path.join(tmpDir, "page");

  try {
    // Write PDF to temp file
    fs.writeFileSync(pdfPath, pdfBuffer);

    // Convert PDF pages to PNG images (max 3 pages, 150dpi)
    await execAsync(`pdftoppm -r 150 -l 3 -png "${pdfPath}" "${imgPrefix}"`);

    // Collect generated images
    const files = fs.readdirSync(tmpDir)
      .filter((f) => f.startsWith("page") && f.endsWith(".png"))
      .sort();

    if (files.length === 0) {
      throw new Error("Could not convert PDF to images");
    }

    // Read images as base64
    const imageContents = files.map((f) => {
      const imgPath = path.join(tmpDir, f);
      const data = fs.readFileSync(imgPath).toString("base64");
      return {
        type: "image" as const,
        source: {
          type: "base64" as const,
          media_type: "image/png" as const,
          data,
        },
      };
    });

    // Call Claude with the invoice images
    const client = new Anthropic();

    const systemPrompt = `You are an expert invoice parser for a food service / hospitality costing system.
Extract all relevant data from the invoice image(s) and return ONLY valid JSON, no markdown fences.

Categories to classify items into (pick the closest match):
${CATEGORIES.join(", ")}

Valid units: ${UNITS.join(", ")}

Rules:
- invoiceDate must be YYYY-MM-DD format. If only month/year, use the 1st of the month.
- totalCost for each line item is the extended/line total (price × qty), NOT the unit price
- quantity is the number of units ordered (number of cases, bags, etc. purchased)
- unit is the unit of measure for quantity (almost always "case" for foodservice invoices)
- Round totalCost to 2 decimal places
- If invoiceNumber is not visible, use "UNKNOWN"
- Classify each item into the most appropriate category
- Only include actual product line items — skip tax, freight, service fees, discounts as separate items (include freight/fees in notes)

PACK SIZE EXTRACTION — THIS IS THE MOST IMPORTANT PART:
Foodservice invoices almost always show a pack/size breakdown in the item description. You MUST extract this.

CRITICAL RULE: packUnit must ALWAYS be a simple base unit from this list ONLY:
  lb, oz, kg, g, each, gallon, quart, pint, liter, fl oz, can, roll, sheet, dozen
NEVER put descriptions like "bag of 10 lb" or "carton of 32 oz" in packUnit.
Instead, fold the weight/count INTO packSize and use the simple base unit.

Common formats you will see on invoices:
  "4/1 GAL"  → qty: cases, packSize: 4,  packUnit: "gallon"  (4 gallons per case)
  "6/10 CAN" → qty: cases, packSize: 6,  packUnit: "can"     (6 cans per case)
  "12/24 OZ" → qty: cases, packSize: 288, packUnit: "oz"     (12 × 24 oz = 288 oz per case)
  "2/5 LB"   → qty: cases, packSize: 10, packUnit: "lb"      (2 × 5 lb = 10 lb per case)
  "10 LB BAG"→ qty: bags,  packSize: 10, packUnit: "lb"
  "1/30 LB"  → qty: cases, packSize: 30, packUnit: "lb"
  "36CT"     → qty: cases, packSize: 36, packUnit: "each"
  "6 bags of 5 lb" → packSize: 30, packUnit: "lb"  (6 × 5 = 30 lb per case)
  "12 cartons of 32 oz" → packSize: 384, packUnit: "oz"  (12 × 32 = 384 oz per case)
  "4 tubs of 5 lb" → packSize: 20, packUnit: "lb"  (4 × 5 = 20 lb per case)
  "36 each of 1 lb" → packSize: 36, packUnit: "lb"  (36 × 1 = 36 lb per case)
  "24 each of 3 oz" → packSize: 72, packUnit: "oz"  (24 × 3 = 72 oz per case)
  "2 bags of 10 lb" → packSize: 20, packUnit: "lb"
  "1 wheel of 6 lb" → packSize: 6, packUnit: "lb"

For X/Y format: packSize = X * Y (total weight/count per case). packUnit = base unit only.
For weight-sold items (produce, meat sold by lb): if unit is already "lb" or "oz", leave packSize null.

The cost per unit is always: totalCost / (quantity × packSize)
So: $126.47 / (1 case × 60 lb) = $2.11/lb — not "per bag of 10 lb".

Always extract packSize and packUnit when ANY size/count/weight info appears.
Only leave packSize null if the item is sold purely by weight (lb/oz) with no case breakdown.

Return this exact JSON structure:
{
  "vendor": "string",
  "invoiceNumber": "string",
  "invoiceDate": "YYYY-MM-DD",
  "notes": "string or null",
  "items": [
    {
      "itemName": "string",
      "category": "one of the categories above",
      "totalCost": number,
      "quantity": number,
      "unit": "one of the valid units above",
      "packSize": number or null,
      "packUnit": "string or null",
      "notes": "string or null"
    }
  ]
}`;

    const response = await client.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 4096,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: [
            ...imageContents,
            {
              type: "text",
              text: "Extract all invoice data from these pages and return the JSON structure.",
            },
          ],
        },
      ],
    });

    const rawText = response.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("");

    // Strip any accidental markdown fences
    const jsonText = rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
    const parsed = JSON.parse(jsonText) as ParsedInvoice;

    // Sanitize
    parsed.items = (parsed.items ?? []).map((item) => ({
      ...item,
      category: CATEGORIES.includes(item.category) ? item.category : "Other",
      unit: UNITS.includes(item.unit) ? item.unit : "each",
      totalCost: Math.round((item.totalCost ?? 0) * 100) / 100,
      quantity: item.quantity ?? 1,
      packSize: item.packSize ?? null,
      packUnit: item.packUnit ?? null,
      notes: item.notes ?? null,
    }));

    // Fallback: if Claude missed pack info, try to parse it from the item name
    parsed.items = parsed.items.map((item) => {
      if (item.packSize) return item; // already extracted
      const extracted = extractPackFromName(item.itemName);
      if (extracted) {
        return { ...item, packSize: extracted.packSize, packUnit: extracted.packUnit, unit: "case" };
      }
      return item;
    });

    // Normalize complex packUnit strings (e.g. "bag of 10 lb" → packSize=10, packUnit="lb")
    parsed.items = parsed.items.map((item) => {
      if (!item.packSize || !item.packUnit) return item;
      const { packSize, packUnit } = normalizePackUnit(item.quantity, item.packSize, item.packUnit);
      return { ...item, packSize, packUnit };
    });

    return parsed;
  } finally {
    // Cleanup temp dir
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  }
}
