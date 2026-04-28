/**
 * One-time backfill: normalize complex pack_unit strings in existing line_items.
 * Run with: npx ts-node scripts/backfill-pack-units.ts
 */
import { createClient } from "@supabase/supabase-js";
import { normalizePackUnit } from "../server/pdfParser";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
);

async function main() {
  const { data: items, error } = await supabase
    .from("line_items")
    .select("id, quantity, pack_size, pack_unit")
    .not("pack_size", "is", null)
    .not("pack_unit", "is", null);

  if (error) throw error;
  if (!items || items.length === 0) { console.log("No items to backfill"); return; }

  console.log(`Checking ${items.length} items with pack data...`);

  const simpleUnits = new Set(["lb", "oz", "kg", "g", "each", "gallon", "quart", "pint",
    "liter", "fl oz", "can", "roll", "sheet", "dozen", "bottle", "bag", "box", "pack"]);

  let updated = 0;
  for (const item of items) {
    // Skip already-simple units
    if (simpleUnits.has((item.pack_unit ?? "").toLowerCase())) continue;

    const { packSize, packUnit } = normalizePackUnit(
      item.quantity ?? 1,
      item.pack_size,
      item.pack_unit
    );

    if (packSize === item.pack_size && packUnit === item.pack_unit) continue;

    console.log(`  id=${item.id}: "${item.pack_unit}" (x${item.pack_size}) → "${packUnit}" (x${packSize})`);

    await supabase
      .from("line_items")
      .update({ pack_size: packSize, pack_unit: packUnit })
      .eq("id", item.id);

    updated++;
  }

  console.log(`Done. Updated ${updated} items.`);
}

main().catch(console.error);
