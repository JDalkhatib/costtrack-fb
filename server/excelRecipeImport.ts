/**
 * excelRecipeImport.ts
 *
 * Parses one or many cost card sheets from an uploaded .xls / .xlsx file.
 * Each sheet that matches the "STANDARD RECIPE COST CARD" layout is imported
 * as a recipe + its ingredients.
 *
 * Layout reference (1-based rows, 0-based cols):
 *   row 5  col 0  → "Restaurant Name:" label   (ignored — we use session restaurant)
 *   row 6  col 6  → "Standard Portion:" value  col 7
 *   row 7  col 0  → "Classification" label      col 1  (value on same row or next non-null)
 *   row 8  col 6  → "Standard Yield:" value     col 7
 *   row 9  col 0  → "Recipe Name:" label         col 1+
 *   rows 13-31    → ingredient rows:
 *       col 0 = qty, col 1 = unit, col 2 = ingredient name, col 3 = item number,
 *       col 4 = recipe cost (unit cost), col 6 = unit, col 7 = ingredient cost
 *   row 33 col 6  → "Q%:" value                col 7
 *   row 33 col 0  → "Method of Preparation" label (text continues below through row ~38)
 *   row 38 col 9  → "PLATING INSTRUCTIONS" label (text below through ~row 43)
 *   row 41 col 7  → Desired Cost %
 *   row 43 col 7  → Actual Menu Price
 */

import * as XLSX from "xlsx";
import type { InsertRecipe, InsertRecipeIngredient } from "./storage";

export interface ParsedCostCard {
  recipe: InsertRecipe;
  ingredients: InsertRecipeIngredient[];
  sheetName: string;
}

export function parseExcelCostCards(buffer: Buffer): ParsedCostCard[] {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const results: ParsedCostCard[] = [];

  // ── Row/cell helpers (take rows array as closure) ─────────────
  function makeHelpers(rows: (string | number | null)[][]) {
    const cell = (rowIdx: number, colIdx: number): string | number | null =>
      rows[rowIdx]?.[colIdx] ?? null;
    const strCell = (rowIdx: number, colIdx: number): string => {
      const v = cell(rowIdx, colIdx);
      return v != null ? String(v).trim() : "";
    };
    const numCell = (rowIdx: number, colIdx: number): number => {
      const v = cell(rowIdx, colIdx);
      if (v == null || v === "") return 0;
      const n = Number(v);
      return isNaN(n) ? 0 : n;
    };
    return { cell, strCell, numCell };
  }

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const rows: (string | number | null)[][] = XLSX.utils.sheet_to_json(ws, {
      header: 1,
      defval: null,
    });

    // Detect cost card sheets by looking for "STANDARD RECIPE COST CARD" in row 2
    const row2 = rows[1] ?? [];
    const isCard = row2.some(
      (v) => typeof v === "string" && v.includes("STANDARD RECIPE COST CARD")
    );
    if (!isCard) continue;

    const { strCell, numCell } = makeHelpers(rows);

    // ── Recipe Name (row 9, search cols 1-12) ────────────────────
    let recipeName = "";
    for (let c = 1; c <= 12; c++) {
      const v = strCell(8, c);
      if (v) { recipeName = v; break; }
    }
    if (!recipeName) {
      // Some filled sheets may put it in a merged region — fall back to sheet name
      recipeName = sheetName !== "Master Recipe Cost Card" ? sheetName : "";
    }
    if (!recipeName) continue; // Skip blank template sheets

    // ── Classification (row 7, cols 1-5) ─────────────────────────
    let classification = "";
    for (let c = 1; c <= 5; c++) {
      const v = strCell(6, c);
      if (v) { classification = v; break; }
    }

    // ── Standard Portion (row 6, col 7) ──────────────────────────
    const standardPortion = strCell(5, 7) || strCell(5, 8) || null;

    // ── Standard Yield (row 8, col 7) ────────────────────────────
    const standardYield = numCell(7, 7) || 1;

    // ── Q Factor (row 33, col 6-7) ───────────────────────────────
    // Row 33 = index 32. Col 6 has "Q%:" label, col 7 has value
    const qFactor = numCell(32, 7) || numCell(32, 6) || 0.03;

    // ── Desired Cost % (row 41, col 7) ───────────────────────────
    let desiredCostPct = numCell(40, 7);
    if (desiredCostPct > 1) desiredCostPct = desiredCostPct / 100; // handle 25 vs 0.25
    if (!desiredCostPct) desiredCostPct = 0.25;

    // ── Actual Menu Price (row 43, col 7) ────────────────────────
    const actualMenuPrice = numCell(42, 7);

    // ── Method of Preparation (rows 33-39, col 0-5) ──────────────
    // "Method of Preparation" label is in row 33 col 0; text is in col 0-4 rows 34-39
    const methodLines: string[] = [];
    for (let r = 33; r <= 39; r++) {
      for (let c = 0; c <= 4; c++) {
        const v = strCell(r, c);
        if (v && !v.toLowerCase().includes("method of preparation")) {
          methodLines.push(v);
          break;
        }
      }
    }
    const methodOfPreparation = methodLines.join("\n").trim() || null;

    // ── Plating Instructions (rows 38-44, col 9-12) ──────────────
    const platingLines: string[] = [];
    for (let r = 37; r <= 44; r++) {
      for (let c = 9; c <= 12; c++) {
        const v = strCell(r, c);
        if (v && !v.toUpperCase().includes("PLATING INSTRUCTIONS")) {
          platingLines.push(v);
          break;
        }
      }
    }
    const platingInstructions = platingLines.join("\n").trim() || null;

    // ── Ingredients (rows 13-31 = indices 12-30) ─────────────────
    // col 0=qty, col 1=unit, col 2=ingredient name, col 3=item#, col 4=unit cost, col 6=unit2, col 7=ingredient cost
    const ingredients: InsertRecipeIngredient[] = [];
    for (let r = 12; r <= 30; r++) {
      const ingredientName = strCell(r, 2);
      if (!ingredientName) continue; // blank row

      const recipeQuantity = numCell(r, 0);
      const recipeUnit = strCell(r, 1) || strCell(r, 6) || "";
      const itemNumber = strCell(r, 3) || null;
      const unitCost = numCell(r, 4);
      const ingredientCost = numCell(r, 7);

      ingredients.push({
        sortOrder: ingredients.length,
        ingredientName,
        itemNumber,
        recipeQuantity,
        recipeUnit,
        unitCost,
        ingredientCost,
        lineItemId: null,
      });
    }

    const recipe: InsertRecipe = {
      name: recipeName,
      classification: classification || null,
      standardPortion: standardPortion || null,
      standardYield,
      methodOfPreparation,
      platingInstructions,
      desiredCostPct,
      actualMenuPrice,
      qFactor,
      allergens: [],
      notes: null,
    };

    results.push({ recipe, ingredients, sheetName });
  }

  return results;
}
