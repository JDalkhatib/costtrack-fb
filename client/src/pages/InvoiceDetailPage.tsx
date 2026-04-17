import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import {
  CATEGORIES,
  UNITS,
  type LineItem,
  type InsertLineItem,
  insertLineItemSchema,
} from "@shared/schema";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, Trash2, Plus, Package } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { useState } from "react";
import { CATEGORY_COLORS } from "@/lib/categoryColors";

// Cost per unit calculation
function calcCostPerUnit(item: LineItem): { costPerUnit: number; label: string } {
  // If packSize provided: each case has packSize units
  // costPerUnit = totalCost / (quantity * packSize)
  // display as $/packUnit
  if (item.packSize && item.packUnit && item.packSize > 0) {
    const totalUnits = item.quantity * item.packSize;
    return {
      costPerUnit: item.totalCost / totalUnits,
      label: `/${item.packUnit}`,
    };
  }
  // Simple: totalCost / quantity
  return {
    costPerUnit: item.quantity > 0 ? item.totalCost / item.quantity : 0,
    label: `/${item.unit}`,
  };
}

const itemFormSchema = insertLineItemSchema
  .omit({ invoiceId: true })
  .extend({
    itemName: z.string().min(1, "Item name required"),
    totalCost: z.coerce.number().min(0, "Cost must be 0 or more"),
    quantity: z.coerce.number().positive("Quantity must be positive"),
    packSize: z.coerce.number().optional(),
    packUnit: z.string().optional(),
  });

type ItemFormValues = z.infer<typeof itemFormSchema>;

function AddItemForm({ invoiceId }: { invoiceId: number }) {
  const { toast } = useToast();
  const [showPackFields, setShowPackFields] = useState(false);

  const form = useForm<ItemFormValues>({
    resolver: zodResolver(itemFormSchema),
    defaultValues: {
      itemName: "",
      category: "Other",
      totalCost: 0,
      quantity: 1,
      unit: "each",
      packSize: undefined,
      packUnit: undefined,
      notes: "",
    },
  });

  const mutation = useMutation({
    mutationFn: (data: ItemFormValues) =>
      apiRequest("POST", `/api/invoices/${invoiceId}/items`, {
        ...data,
        invoiceId,
        packSize: data.packSize || null,
        packUnit: data.packUnit || null,
        notes: data.notes || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/invoices", invoiceId] });
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      form.reset({
        itemName: "",
        category: form.getValues("category"),
        totalCost: 0,
        quantity: 1,
        unit: form.getValues("unit"),
        packSize: undefined,
        packUnit: undefined,
        notes: "",
      });
      toast({ title: "Item added" });
    },
    onError: () => toast({ title: "Error adding item", variant: "destructive" }),
  });

  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <h3 className="font-semibold text-sm mb-4 flex items-center gap-2">
        <Plus size={14} className="text-primary" />
        Add Line Item
      </h3>
      <Form {...form}>
        <form
          onSubmit={form.handleSubmit((d) => mutation.mutate(d))}
          className="space-y-3"
        >
          {/* Row 1: name + category */}
          <div className="grid grid-cols-3 gap-3">
            <FormField
              control={form.control}
              name="itemName"
              render={({ field }) => (
                <FormItem className="col-span-2">
                  <FormLabel className="text-xs">Item Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Ground Beef 80/20" data-testid="input-item-name" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="category"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs">Category</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-category">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {CATEGORIES.map((c) => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          {/* Row 2: total cost + quantity + unit */}
          <div className="grid grid-cols-3 gap-3">
            <FormField
              control={form.control}
              name="totalCost"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs">Total Cost ($)</FormLabel>
                  <FormControl>
                    <Input type="number" step="0.01" min="0" placeholder="0.00" data-testid="input-total-cost" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="quantity"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs">Quantity</FormLabel>
                  <FormControl>
                    <Input type="number" step="0.001" min="0.001" placeholder="1" data-testid="input-quantity" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="unit"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs">Unit</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-unit">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {UNITS.map((u) => (
                        <SelectItem key={u} value={u}>{u}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          {/* Pack size toggle */}
          <div>
            <button
              type="button"
              onClick={() => setShowPackFields((v) => !v)}
              className="text-xs text-primary hover:underline"
              data-testid="button-toggle-pack"
            >
              {showPackFields ? "− Hide pack size" : "+ Add pack size (e.g. 1 case = 24 each)"}
            </button>
          </div>

          {showPackFields && (
            <div className="grid grid-cols-2 gap-3 pl-3 border-l-2 border-primary/20">
              <FormField
                control={form.control}
                name="packSize"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">Units per Pack</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.001"
                        min="0"
                        placeholder="e.g. 24"
                        data-testid="input-pack-size"
                        {...field}
                        value={field.value ?? ""}
                        onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="packUnit"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">Unit per Pack</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value ?? ""}>
                      <FormControl>
                        <SelectTrigger data-testid="select-pack-unit">
                          <SelectValue placeholder="Select unit" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {UNITS.map((u) => (
                          <SelectItem key={u} value={u}>{u}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          )}

          <Button
            type="submit"
            size="sm"
            disabled={mutation.isPending}
            data-testid="button-add-item"
            className="w-full"
          >
            {mutation.isPending ? "Adding..." : "Add Item"}
          </Button>
        </form>
      </Form>
    </div>
  );
}

function LineItemRow({ item }: { item: LineItem }) {
  const { toast } = useToast();
  const { costPerUnit, label } = calcCostPerUnit(item);
  const color = CATEGORY_COLORS[item.category] ?? "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300";

  const deleteMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/items/${item.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/invoices", item.invoiceId] });
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      toast({ title: "Item removed" });
    },
  });

  return (
    <tr
      className="border-b border-border/50 hover:bg-muted/30 transition-colors group"
      data-testid={`row-item-${item.id}`}
    >
      <td className="py-2.5 px-3">
        <div className="font-medium text-sm" data-testid={`text-item-name-${item.id}`}>{item.itemName}</div>
        {item.notes && <div className="text-xs text-muted-foreground">{item.notes}</div>}
      </td>
      <td className="py-2.5 px-3">
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>
          {item.category}
        </span>
      </td>
      <td className="py-2.5 px-3 text-sm text-right tabular-nums">
        ${item.totalCost.toFixed(2)}
      </td>
      <td className="py-2.5 px-3 text-sm text-right tabular-nums text-muted-foreground">
        {item.quantity} {item.unit}
        {item.packSize && item.packUnit && (
          <span className="block text-xs">× {item.packSize} {item.packUnit}/ea</span>
        )}
      </td>
      <td className="py-2.5 px-3 text-right">
        <span
          className="font-semibold text-sm text-primary tabular-nums"
          data-testid={`text-cost-per-unit-${item.id}`}
        >
          ${costPerUnit.toFixed(4)}{label}
        </span>
      </td>
      <td className="py-2.5 px-3 text-right">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
              data-testid={`button-delete-item-${item.id}`}
            >
              <Trash2 size={13} />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove Item?</AlertDialogTitle>
              <AlertDialogDescription>
                Remove "{item.itemName}" from this invoice?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => deleteMutation.mutate()}
                className="bg-destructive hover:bg-destructive/90"
              >
                Remove
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </td>
    </tr>
  );
}

export default function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const invoiceId = parseInt(id);

  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/invoices", invoiceId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/invoices/${invoiceId}`);
      return res.json();
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-20 text-muted-foreground">
        Invoice not found.{" "}
        <Link href="/" className="text-primary hover:underline">Back to invoices</Link>
      </div>
    );
  }

  const items: LineItem[] = data.items ?? [];
  const totalCost = items.reduce((s, i) => s + i.totalCost, 0);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Link href="/">
          <Button variant="ghost" size="icon" className="h-8 w-8 mt-0.5" data-testid="button-back">
            <ArrowLeft size={16} />
          </Button>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-semibold">{data.vendor}</h1>
            <Badge variant="outline">#{data.invoiceNumber}</Badge>
          </div>
          <div className="text-sm text-muted-foreground mt-0.5 flex items-center gap-3">
            <span>{format(new Date(data.invoiceDate), "MMMM d, yyyy")}</span>
            {data.notes && <span>· {data.notes}</span>}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-xs text-muted-foreground">Invoice Total</div>
          <div className="text-lg font-bold text-primary tabular-nums" data-testid="text-invoice-total">
            ${totalCost.toFixed(2)}
          </div>
          <div className="text-xs text-muted-foreground">{items.length} item{items.length !== 1 ? "s" : ""}</div>
        </div>
      </div>

      {/* Line items table */}
      {items.length > 0 ? (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-xs text-muted-foreground uppercase tracking-wide">
                  <th className="py-2.5 px-3 text-left font-medium">Item</th>
                  <th className="py-2.5 px-3 text-left font-medium">Category</th>
                  <th className="py-2.5 px-3 text-right font-medium">Total Cost</th>
                  <th className="py-2.5 px-3 text-right font-medium">Qty / Unit</th>
                  <th className="py-2.5 px-3 text-right font-medium">Cost / Unit</th>
                  <th className="py-2.5 px-3"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <LineItemRow key={item.id} item={item} />
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-border bg-muted/20">
                  <td colSpan={2} className="py-2.5 px-3 text-xs text-muted-foreground font-medium">
                    {items.length} item{items.length !== 1 ? "s" : ""}
                  </td>
                  <td className="py-2.5 px-3 text-right font-bold tabular-nums text-sm" data-testid="text-total-cost">
                    ${totalCost.toFixed(2)}
                  </td>
                  <td colSpan={3} />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-10 border border-dashed border-border rounded-xl bg-muted/20 text-center">
          <Package size={32} className="text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">No items yet — add your first line item below</p>
        </div>
      )}

      {/* Add item form */}
      <AddItemForm invoiceId={invoiceId} />
    </div>
  );
}
