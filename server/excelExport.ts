import ExcelJS from "exceljs";
import type { Invoice, LineItem } from "@shared/schema";

// ── Category buckets ─────────────────────────────────────
const FOOD_CATEGORIES = new Set([
  "Meat & Seafood",
  "Produce",
  "Dairy & Eggs",
  "Bakery & Bread",
  "Dry Goods & Pantry",
  "Beverages",
  "Frozen",
]);

const SUPPLY_CATEGORIES = new Set([
  "Cleaning & Supplies",
  "Paper & Packaging",
  "Other",
]);

function bucket(category: string): "Food" | "Kitchen Supplies" {
  return FOOD_CATEGORIES.has(category) ? "Food" : "Kitchen Supplies";
}

// ── Palette ───────────────────────────────────────────────
const TEAL       = "FF01696F";
const TEAL_LIGHT = "FFCEDCD8";
const DARK       = "FF28251D";
const WHITE      = "FFFFFFFF";
const MUTED_BG   = "FFF3F0EC";
const BORDER_CLR = "FFD4D1CA";
const FOOD_CLR   = "FFD4DFCC";   // soft green
const SUPPLY_CLR = "FFDACFD7";  // soft mauve
const GOLD_CLR   = "FFE9E0C6";   // soft gold for totals

// ── Helpers ───────────────────────────────────────────────
function applyHeaderRow(row: ExcelJS.Row, bgHex = TEAL, fgHex = WHITE) {
  row.height = 22;
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: fgHex }, size: 10 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bgHex } };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = {
      bottom: { style: "thin", color: { argb: BORDER_CLR } },
    };
  });
}

function applyTotalRow(row: ExcelJS.Row) {
  row.height = 20;
  row.eachCell({ includeEmpty: false }, (cell) => {
    cell.font = { bold: true, size: 10, color: { argb: DARK } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GOLD_CLR } };
    cell.border = {
      top: { style: "thin", color: { argb: BORDER_CLR } },
      bottom: { style: "medium", color: { argb: TEAL } },
    };
  });
}

function applyDataRow(row: ExcelJS.Row, shade: boolean) {
  row.height = 17;
  if (shade) {
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: MUTED_BG } };
    });
  }
  row.eachCell({ includeEmpty: false }, (cell) => {
    cell.alignment = { vertical: "middle", ...cell.alignment };
  });
}

function setCols(ws: ExcelJS.Worksheet, defs: { width: number; key?: string }[]) {
  ws.columns = defs.map((d, i) => ({
    width: d.width,
    key: d.key ?? String(i + 1),
  }));
}

function addTitle(ws: ExcelJS.Worksheet, title: string, subtitle: string, colCount: number) {
  const t = ws.addRow([title]);
  ws.mergeCells(t.number, 1, t.number, colCount);
  t.getCell(1).font = { bold: true, size: 14, color: { argb: TEAL } };
  t.getCell(1).alignment = { vertical: "middle" };
  t.height = 28;

  const s = ws.addRow([subtitle]);
  ws.mergeCells(s.number, 1, s.number, colCount);
  s.getCell(1).font = { size: 10, color: { argb: "FF7A7974" } };
  s.height = 16;

  ws.addRow([]); // spacer
}

function cpuLabel(item: LineItem): string {
  if (item.packSize && item.packUnit) return `/${item.packUnit}`;
  return `/${item.unit}`;
}

function cpuValue(item: LineItem): number {
  if (item.packSize && item.packUnit && item.packSize > 0) {
    return item.totalCost / (item.quantity * item.packSize);
  }
  return item.quantity > 0 ? item.totalCost / item.quantity : 0;
}

// ── Main export function ──────────────────────────────────
export async function generateInvoiceWorkbook(
  invoices: Invoice[],
  allItems: LineItem[],
  month: string | null // "YYYY-MM" or null = all time
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "CostTrack";
  wb.created = new Date();

  // ── Filter by month ───────────────────────────────────
  let filteredInvoices = invoices;
  let filteredItems = allItems;

  if (month) {
    filteredInvoices = invoices.filter((inv) => inv.invoiceDate.startsWith(month));
    const invIds = new Set(filteredInvoices.map((i) => i.id));
    filteredItems = allItems.filter((item) => invIds.has(item.invoiceId));
  }

  const invoiceMap = new Map(filteredInvoices.map((inv) => [inv.id, inv]));
  const monthLabel = month
    ? new Date(month + "-01").toLocaleDateString("en-US", { month: "long", year: "numeric" })
    : "All Time";

  // ══════════════════════════════════════════════════════
  // Sheet 1: Monthly Summary
  // ══════════════════════════════════════════════════════
  buildSummarySheet(wb, filteredInvoices, filteredItems, monthLabel);

  // ══════════════════════════════════════════════════════
  // Sheet 2: All Invoice Line Items
  // ══════════════════════════════════════════════════════
  buildLineItemSheet(wb, "All Items", filteredItems, invoiceMap, null, monthLabel);

  // ══════════════════════════════════════════════════════
  // Sheet 3: Food Spend
  // ══════════════════════════════════════════════════════
  const foodItems = filteredItems.filter((i) => bucket(i.category) === "Food");
  buildLineItemSheet(wb, "Food Spend", foodItems, invoiceMap, "Food", monthLabel);

  // ══════════════════════════════════════════════════════
  // Sheet 4: Kitchen Supplies
  // ══════════════════════════════════════════════════════
  const supplyItems = filteredItems.filter((i) => bucket(i.category) === "Kitchen Supplies");
  buildLineItemSheet(wb, "Kitchen Supplies", supplyItems, invoiceMap, "Kitchen Supplies", monthLabel);

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

// ── Summary Sheet ─────────────────────────────────────────
function buildSummarySheet(
  wb: ExcelJS.Workbook,
  invoices: Invoice[],
  items: LineItem[],
  monthLabel: string
) {
  const ws = wb.addWorksheet("Summary", {
    views: [{ showGridLines: false }],
    pageSetup: { paperSize: 9, orientation: "portrait", fitToPage: true },
  });
  setCols(ws, [
    { width: 28 }, // A
    { width: 18 }, // B
    { width: 18 }, // C
    { width: 18 }, // D
  ]);

  addTitle(ws, `Spend Summary — ${monthLabel}`, `Generated ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`, 4);

  const totalSpend = items.reduce((s, i) => s + i.totalCost, 0);
  const foodSpend  = items.filter((i) => bucket(i.category) === "Food").reduce((s, i) => s + i.totalCost, 0);
  const supplySpend = totalSpend - foodSpend;

  // ── KPI block ─────────────────────────────────────────
  const kpiLabel = (ws: ExcelJS.Worksheet, label: string, val: number, bgHex: string) => {
    const lr = ws.addRow([label, "", `$${val.toFixed(2)}`, ""]);
    ws.mergeCells(lr.number, 1, lr.number, 2);
    ws.mergeCells(lr.number, 3, lr.number, 4);
    lr.height = 30;
    lr.getCell(1).font = { bold: true, size: 11, color: { argb: DARK } };
    lr.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: bgHex } };
    lr.getCell(3).font = { bold: true, size: 13, color: { argb: TEAL } };
    lr.getCell(3).fill = { type: "pattern", pattern: "solid", fgColor: { argb: bgHex } };
    lr.getCell(3).alignment = { horizontal: "right", vertical: "middle" };
    lr.getCell(1).alignment = { horizontal: "left", vertical: "middle", indent: 1 };
  };

  kpiLabel(ws, "Total Spend", totalSpend, TEAL_LIGHT);
  ws.addRow([]);
  kpiLabel(ws, "Food & Beverage Spend", foodSpend, FOOD_CLR);
  kpiLabel(ws, "Kitchen Supply Spend", supplySpend, SUPPLY_CLR);
  ws.addRow([]);

  // ── Spend by category ─────────────────────────────────
  const catRow = ws.addRow(["Category", "Items", "Total Spend", "% of Total"]);
  applyHeaderRow(catRow);

  const catMap: Record<string, { count: number; total: number }> = {};
  items.forEach((item) => {
    if (!catMap[item.category]) catMap[item.category] = { count: 0, total: 0 };
    catMap[item.category].count++;
    catMap[item.category].total += item.totalCost;
  });

  const cats = Object.entries(catMap).sort((a, b) => b[1].total - a[1].total);
  const catStartRow = ws.rowCount + 1;

  cats.forEach(([cat, { count, total }], idx) => {
    const pct = totalSpend > 0 ? total / totalSpend : 0;
    const r = ws.addRow([cat, count, total, pct]);
    applyDataRow(r, idx % 2 === 1);
    r.getCell(1).alignment = { horizontal: "left", vertical: "middle", indent: 1 };
    r.getCell(2).numFmt = "#,##0";
    r.getCell(2).alignment = { horizontal: "right", vertical: "middle" };
    r.getCell(3).numFmt = "$#,##0.00";
    r.getCell(3).alignment = { horizontal: "right", vertical: "middle" };
    r.getCell(4).numFmt = "0.0%";
    r.getCell(4).alignment = { horizontal: "right", vertical: "middle" };
    // Color badge by bucket
    const bg = FOOD_CATEGORIES.has(cat) ? FOOD_CLR : SUPPLY_CLR;
    r.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: bg } };
  });

  const catEndRow = ws.rowCount;
  const totalR = ws.addRow(["Total", cats.reduce((s, [, v]) => s + v.count, 0), totalSpend, 1]);
  applyTotalRow(totalR);
  totalR.getCell(1).alignment = { horizontal: "left", vertical: "middle", indent: 1 };
  totalR.getCell(2).numFmt = "#,##0";
  totalR.getCell(2).alignment = { horizontal: "right", vertical: "middle" };
  totalR.getCell(3).numFmt = "$#,##0.00";
  totalR.getCell(3).alignment = { horizontal: "right", vertical: "middle" };
  totalR.getCell(4).numFmt = "0.0%";
  totalR.getCell(4).alignment = { horizontal: "right", vertical: "middle" };

  ws.addRow([]);

  // ── Invoices in period ────────────────────────────────
  const invHdr = ws.addRow(["Invoice #", "Vendor", "Date", "Total"]);
  applyHeaderRow(invHdr);

  [...invoices]
    .sort((a, b) => a.invoiceDate.localeCompare(b.invoiceDate))
    .forEach((inv, idx) => {
      const invTotal = items.filter((i) => i.invoiceId === inv.id).reduce((s, i) => s + i.totalCost, 0);
      const r = ws.addRow([inv.invoiceNumber, inv.vendor, inv.invoiceDate, invTotal]);
      applyDataRow(r, idx % 2 === 1);
      r.getCell(1).alignment = { horizontal: "left", vertical: "middle", indent: 1 };
      r.getCell(2).alignment = { horizontal: "left", vertical: "middle", indent: 1 };
      r.getCell(3).numFmt = "mm/dd/yyyy";
      r.getCell(3).alignment = { horizontal: "center", vertical: "middle" };
      r.getCell(4).numFmt = "$#,##0.00";
      r.getCell(4).alignment = { horizontal: "right", vertical: "middle" };
    });

  const invTotR = ws.addRow(["", "", "Total", totalSpend]);
  applyTotalRow(invTotR);
  invTotR.getCell(3).alignment = { horizontal: "center", vertical: "middle" };
  invTotR.getCell(4).numFmt = "$#,##0.00";
  invTotR.getCell(4).alignment = { horizontal: "right", vertical: "middle" };
}

// ── Line Items Sheet (All / Food / Supplies) ─────────────
function buildLineItemSheet(
  wb: ExcelJS.Workbook,
  sheetName: string,
  items: LineItem[],
  invoiceMap: Map<number, Invoice>,
  bucketFilter: "Food" | "Kitchen Supplies" | null,
  monthLabel: string
) {
  const accentBg = bucketFilter === "Food" ? FOOD_CLR : bucketFilter === "Kitchen Supplies" ? SUPPLY_CLR : TEAL_LIGHT;

  const ws = wb.addWorksheet(sheetName, {
    views: [{ showGridLines: false }],
  });

  setCols(ws, [
    { width: 20 }, // A: Invoice #
    { width: 22 }, // B: Vendor
    { width: 13 }, // C: Date
    { width: 30 }, // D: Product
    { width: 20 }, // E: Category
    { width: 13 }, // F: Total Cost
    { width: 14 }, // G: Quantity
    { width: 10 }, // H: Unit
    { width: 14 }, // I: Cost / Unit
    { width: 12 }, // J: Bucket
  ]);

  const title = bucketFilter
    ? `${bucketFilter} Spend — ${monthLabel}`
    : `All Invoice Items — ${monthLabel}`;
  addTitle(ws, title, `${items.length} line item${items.length !== 1 ? "s" : ""}`, 10);

  // Header
  const hdr = ws.addRow([
    "Invoice #", "Vendor", "Date", "Product", "Category",
    "Total Cost", "Qty", "Unit", "Cost / Unit", "Type",
  ]);
  applyHeaderRow(hdr, TEAL);
  ws.getRow(hdr.number).height = 22;

  // Data rows
  const sorted = [...items].sort((a, b) => {
    const ia = invoiceMap.get(a.invoiceId);
    const ib = invoiceMap.get(b.invoiceId);
    return (ia?.invoiceDate ?? "").localeCompare(ib?.invoiceDate ?? "");
  });

  sorted.forEach((item, idx) => {
    const inv = invoiceMap.get(item.invoiceId);
    const cpu = cpuValue(item);
    const label = cpuLabel(item);
    const r = ws.addRow([
      inv?.invoiceNumber ?? "",
      inv?.vendor ?? "",
      inv?.invoiceDate ?? "",
      item.itemName,
      item.category,
      item.totalCost,
      item.quantity + (item.packSize ? ` × ${item.packSize} ${item.packUnit}` : ""),
      item.unit,
      cpu,
      bucket(item.category),
    ]);
    applyDataRow(r, idx % 2 === 1);

    r.getCell(1).alignment = { horizontal: "left", vertical: "middle", indent: 1 };
    r.getCell(2).alignment = { horizontal: "left", vertical: "middle", indent: 1 };
    r.getCell(3).numFmt = "mm/dd/yyyy";
    r.getCell(3).alignment = { horizontal: "center", vertical: "middle" };
    r.getCell(4).alignment = { horizontal: "left", vertical: "middle", indent: 1 };
    r.getCell(5).alignment = { horizontal: "left", vertical: "middle", indent: 1 };
    r.getCell(6).numFmt = "$#,##0.00";
    r.getCell(6).alignment = { horizontal: "right", vertical: "middle" };
    r.getCell(7).alignment = { horizontal: "right", vertical: "middle" };
    r.getCell(8).alignment = { horizontal: "center", vertical: "middle" };
    r.getCell(9).numFmt = "$#,##0.0000";
    r.getCell(9).alignment = { horizontal: "right", vertical: "middle" };
    // Append unit label as suffix in adjacent cell would clutter — store as formatted string
    r.getCell(9).value = `$${cpu.toFixed(4)}${label}`;
    r.getCell(10).alignment = { horizontal: "center", vertical: "middle" };

    // Color type badge
    const typeBg = bucket(item.category) === "Food" ? FOOD_CLR : SUPPLY_CLR;
    r.getCell(10).fill = { type: "pattern", pattern: "solid", fgColor: { argb: typeBg } };
    r.getCell(10).font = { bold: true, size: 9, color: { argb: DARK } };
  });

  // Total row
  const totalCost = items.reduce((s, i) => s + i.totalCost, 0);
  const totR = ws.addRow(["", "", "", `${items.length} items`, "", totalCost, "", "", "", ""]);
  applyTotalRow(totR);
  totR.getCell(4).alignment = { horizontal: "left", vertical: "middle", indent: 1 };
  totR.getCell(6).numFmt = "$#,##0.00";
  totR.getCell(6).alignment = { horizontal: "right", vertical: "middle" };

  // Freeze header
  ws.views = [{ state: "frozen", ySplit: hdr.number, showGridLines: false }];
}
