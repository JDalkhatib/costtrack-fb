import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { CATEGORIES, type LineItem } from "@shared/schema";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import { ChevronRight } from "lucide-react";
import { CATEGORY_COLORS } from "@/lib/categoryColors";
import { calcCostPerUnit } from "@/lib/costCalc";

export default function CategoriesPage() {
  const { data: items, isLoading } = useQuery<LineItem[]>({
    queryKey: ["/api/items"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/items");
      return res.json();
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48 mb-6" />
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-32 w-full rounded-xl" />)}
      </div>
    );
  }

  const grouped = CATEGORIES.reduce<Record<string, LineItem[]>>((acc, cat) => {
    acc[cat] = (items ?? []).filter((i) => i.category === cat);
    return acc;
  }, {});

  const activeCategories = CATEGORIES.filter((c) => grouped[c].length > 0);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold">Items by Category</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {items?.length ?? 0} total items across {activeCategories.length} categories
        </p>
      </div>

      {!items?.length ? (
        <div className="text-center py-20 text-muted-foreground border border-dashed border-border rounded-xl bg-muted/20">
          <p className="font-medium">No items yet</p>
          <p className="text-sm mt-1">
            Add items to invoices to see them organized here.{" "}
            <Link href="/" className="text-primary hover:underline">Go to Invoices</Link>
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {activeCategories.map((category) => {
            const catItems = grouped[category];
            const totalSpend = catItems.reduce((s, i) => s + i.totalCost, 0);
            const colorClass = CATEGORY_COLORS[category] ?? "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300";

            return (
              <div
                key={category}
                className="bg-card border border-border rounded-xl overflow-hidden"
                data-testid={`section-category-${category.replace(/\s+/g, "-").toLowerCase()}`}
              >
                {/* Category header */}
                <div className="flex items-center justify-between px-4 py-3 bg-muted/30 border-b border-border">
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold ${colorClass}`}>
                      {category}
                    </span>
                    <span className="text-xs text-muted-foreground">{catItems.length} item{catItems.length !== 1 ? "s" : ""}</span>
                  </div>
                  <span className="text-sm font-semibold tabular-nums text-primary">
                    ${totalSpend.toFixed(2)} total
                  </span>
                </div>

                {/* Items table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-muted-foreground uppercase tracking-wide border-b border-border/50">
                        <th className="py-2 px-4 text-left font-medium">Item</th>
                        <th className="py-2 px-4 text-right font-medium">Total Cost</th>
                        <th className="py-2 px-4 text-right font-medium">Qty</th>
                        <th className="py-2 px-4 text-right font-medium">Cost / Unit</th>
                        <th className="py-2 px-4 text-right font-medium">Invoice</th>
                      </tr>
                    </thead>
                    <tbody>
                      {catItems.map((item) => {
                        const { costPerUnit, label, isContainerUnit } = calcCostPerUnit(item);
                        return (
                          <tr
                            key={item.id}
                            className="border-b border-border/30 hover:bg-muted/20 transition-colors"
                            data-testid={`row-category-item-${item.id}`}
                          >
                            <td className="py-2.5 px-4">
                              <div className="font-medium">{item.itemName}</div>
                              {item.notes && <div className="text-xs text-muted-foreground">{item.notes}</div>}
                            </td>
                            <td className="py-2.5 px-4 text-right tabular-nums">${item.totalCost.toFixed(2)}</td>
                            <td className="py-2.5 px-4 text-right tabular-nums text-muted-foreground">
                              {item.quantity} {item.unit}
                              {item.packSize && item.packUnit && (
                                <span className="block text-xs">× {item.packSize} {item.packUnit}</span>
                              )}
                            </td>
                            <td className="py-2.5 px-4 text-right">
                              <span className={`font-semibold tabular-nums ${isContainerUnit ? 'text-amber-600 dark:text-amber-400' : 'text-primary'}`}>
                                ${costPerUnit.toFixed(4)}{label}
                              </span>
                              {isContainerUnit && (
                                <span className="block text-xs text-amber-500/80">unit count unknown</span>
                              )}
                            </td>
                            <td className="py-2.5 px-4 text-right">
                              <Link href={`/invoices/${item.invoiceId}`}>
                                <button className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors">
                                  #{item.invoiceId}
                                  <ChevronRight size={11} />
                                </button>
                              </Link>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
