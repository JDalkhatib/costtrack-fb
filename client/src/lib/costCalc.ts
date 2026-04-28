import type { LineItem } from "@shared/schema";

/**
 * Calculates the true cost per smallest unit for a line item.
 *
 * Logic:
 *   - If packSize + packUnit present:  costPerUnit = totalCost / (quantity × packSize)
 *     Label: "/$packUnit"  (e.g. "/lb", "/oz", "/each")
 *   - Otherwise: costPerUnit = totalCost / quantity
 *     Label: "/$unit"  (e.g. "/case", "/lb")
 *
 * packSize already represents total units per case after backfill normalization,
 * so no additional multiplication is needed.
 */
export function calcCostPerUnit(item: LineItem): { costPerUnit: number; label: string } {
  if (item.packSize && item.packUnit && item.packSize > 0) {
    const totalUnits = item.quantity * item.packSize;
    const costPerUnit = totalUnits > 0 ? item.totalCost / totalUnits : 0;
    // Truncate any multi-word descriptions that slipped through (safety net)
    const label = item.packUnit.trim().split(/\s+/).length > 2
      ? `/${item.packUnit.trim().split(/\s+/).pop()}`
      : `/${item.packUnit}`;
    return { costPerUnit, label };
  }
  return {
    costPerUnit: item.quantity > 0 ? item.totalCost / item.quantity : 0,
    label: `/${item.unit}`,
  };
}

/** Returns a display string like "$3.36/lb" or "$2.11/lb" */
export function formatCostPerUnit(item: LineItem): string {
  const { costPerUnit, label } = calcCostPerUnit(item);
  return `$${costPerUnit.toFixed(4)}${label}`;
}
