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
  packSize?: number;
  packUnit?: string;
  notes?: string;
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
- quantity is the number of units ordered
- unit is the unit of measure for the quantity (e.g. "case", "lb", "each")
- If the invoice shows a pack breakdown (e.g. "24/case"), fill packSize and packUnit
- If no pack breakdown, leave packSize and packUnit as null
- Round totalCost to 2 decimal places
- If invoiceNumber is not visible, use "UNKNOWN"
- Classify each item into the most appropriate category
- Only include actual product line items — skip tax, freight, service fees, discounts as separate items (include freight/fees in notes at invoice level if present)

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

    return parsed;
  } finally {
    // Cleanup temp dir
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  }
}
