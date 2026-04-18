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
Common formats you will see:
  - "4/1 GAL" → packSize: 4, packUnit: "gallon"  (4 jugs of 1 gallon each)
  - "6/10 CAN" → packSize: 6, packUnit: "can"  (6 cans per case)
  - "12/24 OZ" → packSize: 12, packUnit: "oz"  (12 units of 24 oz)
  - "24/16OZ" → packSize: 24, packUnit: "oz"
  - "2/5 LB" → packSize: 2, packUnit: "lb"  (2 bags of 5 lb = 10 lb total per case)
  - "10 LB BAG" → packSize: 10, packUnit: "lb"  (bag sold by weight)
  - "80/3 OZ" → packSize: 80, packUnit: "oz"
  - "1/30 LB" → packSize: 30, packUnit: "lb"
  - "CS/24" → packSize: 24, packUnit: "each"
  - "36CT" or "36 COUNT" → packSize: 36, packUnit: "each"
  - "1 EA" with weight in description → use the weight as packSize and packUnit

For weight-sold items (produce, meat sold by the pound):
  - If unit is already "lb" or "oz", leave packSize null — the cost per lb is totalCost / quantity

For items sold by the case with a pack/size breakdown:
  - packSize = the COUNT or WEIGHT per case (the second number in formats like X/Y)
  - packUnit = the unit of that count/weight (oz, lb, gallon, each, can, etc.)
  - The cost per unit will be calculated as: totalCost / (quantity × packSize)

Examples:
  Item: "CHICKEN BREAST 2/5 LB", qty: 3 cases, total: $45.00
  → unit: "case", packSize: 5, packUnit: "lb"  [gives $3.00/lb]

  Item: "OLIVE OIL 4/1 GAL", qty: 2 cases, total: $80.00
  → unit: "case", packSize: 4, packUnit: "gallon"  [gives $10.00/gallon]

  Item: "PAPER TOWEL 12/85 SH", qty: 1 case, total: $24.00
  → unit: "case", packSize: 12, packUnit: "roll"

Always extract packSize and packUnit when ANY size/count/weight info appears in the description.
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

    return parsed;
  } finally {
    // Cleanup temp dir
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  }
}
