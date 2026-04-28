import type { LineItem } from "@shared/schema";

// Container words that are NOT leaf units — we can show $/pack but note it's not smallest unit
const CONTAINER_UNITS = new Set(["pack", "bag", "box", "bundle", "tray", "sleeve", "roll", "set"]);

// Units that are already the smallest usable unit
const LEAF_UNITS = new Set([
  "lb", "oz", "kg", "g", "each", "gallon", "quart", "pint",
  "liter", "fl oz", "can", "roll", "sheet", "dozen", "bottle",
]);

/**
 * Calculates the true cost per smallest unit for a line item.
 *
 * packSize represents total leaf-units per case AFTER normalization.
 * Formula: costPerUnit = totalCost / (quantity × packSize)
 *
 * If packUnit is a container word (pack, bag, box…) rather than a leaf unit,
 * we still show $/pack — it means the inner count wasn't available on the invoice.
 */
export function calcCostPerUnit(item: LineItem): {
  costPerUnit: number;
  label: string;
  isContainerUnit: boolean;   // true when we couldn't break down further
} {
  if (item.packSize && item.packUnit && item.packSize > 0) {
    const totalUnits = item.quantity * item.packSize;
    const costPerUnit = totalUnits > 0 ? item.totalCost / totalUnits : 0;

    // Sanitize label — strip multi-word leftovers, take last word as fallback
    const rawUnit = item.packUnit.trim();
    const label = rawUnit.split(/\s+/).length > 2
      ? `/${rawUnit.split(/\s+/).pop()!}`
      : `/${rawUnit}`;

    const isContainerUnit = CONTAINER_UNITS.has(rawUnit.toLowerCase());
    return { costPerUnit, label, isContainerUnit };
  }

  // No pack breakdown — cost per purchase unit (lb, quart, case, etc.)
  const unit = item.unit ?? "unit";
  const isContainerUnit = unit === "case" || CONTAINER_UNITS.has(unit.toLowerCase());
  return {
    costPerUnit: item.quantity > 0 ? item.totalCost / item.quantity : 0,
    label: `/${unit}`,
    isContainerUnit,
  };
}

/** Returns a display string like "$3.36/lb" */
export function formatCostPerUnit(item: LineItem): string {
  const { costPerUnit, label } = calcCostPerUnit(item);
  return `$${costPerUnit.toFixed(4)}${label}`;
}
