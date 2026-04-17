import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertInvoiceSchema, type InsertInvoice, CATEGORIES, UNITS } from "@shared/schema";
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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, FileUp, PenLine, CheckCircle2, Edit2, Trash2 } from "lucide-react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { PdfUploader, type ParsedInvoice } from "@/components/PdfUploader";
import { CATEGORY_COLORS } from "@/lib/categoryColors";

const formSchema = insertInvoiceSchema.extend({
  invoiceNumber: z.string().min(1, "Invoice number is required"),
  vendor: z.string().min(1, "Vendor name is required"),
  invoiceDate: z.string().min(1, "Date is required"),
});

type Mode = "choose" | "manual" | "pdf-preview";

export default function NewInvoicePage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [mode, setMode] = useState<Mode>("choose");
  const [parsedData, setParsedData] = useState<ParsedInvoice | null>(null);
  // Track edits to parsed items before import
  const [parsedItems, setParsedItems] = useState<ParsedInvoice["items"]>([]);

  const form = useForm<InsertInvoice>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      invoiceNumber: "",
      vendor: "",
      invoiceDate: new Date().toISOString().split("T")[0],
      notes: "",
    },
  });

  // Create invoice + all items in one shot
  const mutation = useMutation({
    mutationFn: async (data: InsertInvoice & { items?: ParsedInvoice["items"] }) => {
      const { items, ...invoiceData } = data;
      const invRes = await apiRequest("POST", "/api/invoices", invoiceData);
      const invoice = await invRes.json();

      if (items && items.length > 0) {
        await Promise.all(
          items.map((item) =>
            apiRequest("POST", `/api/invoices/${invoice.id}/items`, {
              ...item,
              invoiceId: invoice.id,
              packSize: item.packSize ?? null,
              packUnit: item.packUnit ?? null,
              notes: item.notes ?? null,
            })
          )
        );
      }
      return invoice;
    },
    onSuccess: (invoice) => {
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      const itemCount = parsedItems.length;
      toast({
        title: "Invoice imported",
        description: itemCount
          ? `${itemCount} line items imported from PDF.`
          : `Invoice #${invoice.invoiceNumber} created.`,
      });
      navigate(`/invoices/${invoice.id}`);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save invoice.", variant: "destructive" });
    },
  });

  // Called when PDF is successfully parsed
  const handleParsed = (data: ParsedInvoice) => {
    setParsedData(data);
    setParsedItems(data.items);
    form.reset({
      vendor: data.vendor,
      invoiceNumber: data.invoiceNumber,
      invoiceDate: data.invoiceDate,
      notes: data.notes ?? "",
    });
    setMode("pdf-preview");
  };

  const handleRemoveItem = (idx: number) => {
    setParsedItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSubmitManual = (d: InsertInvoice) => {
    mutation.mutate(d);
  };

  const handleSubmitPdf = () => {
    const values = form.getValues();
    mutation.mutate({ ...values, items: parsedItems });
  };

  // ── Mode: choose ──────────────────────────────────────────
  if (mode === "choose") {
    return (
      <div className="max-w-xl">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/">
            <Button variant="ghost" size="icon" className="h-8 w-8" data-testid="button-back">
              <ArrowLeft size={16} />
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-semibold">New Invoice</h1>
            <p className="text-sm text-muted-foreground">How would you like to add it?</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {/* PDF option */}
          <button
            onClick={() => setMode("pdf-preview")}
            data-testid="button-mode-pdf"
            className="group flex flex-col gap-3 p-5 bg-card border-2 border-border hover:border-primary/60 hover:bg-primary/4 rounded-xl text-left transition-all"
          >
            <div className="p-2.5 rounded-lg bg-primary/10 text-primary w-fit">
              <FileUp size={22} />
            </div>
            <div>
              <p className="font-semibold text-sm">Upload PDF</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                AI reads your invoice and fills everything in automatically
              </p>
            </div>
            <Badge variant="outline" className="text-xs w-fit border-primary/30 text-primary bg-primary/5">
              Recommended
            </Badge>
          </button>

          {/* Manual option */}
          <button
            onClick={() => setMode("manual")}
            data-testid="button-mode-manual"
            className="group flex flex-col gap-3 p-5 bg-card border-2 border-border hover:border-primary/60 hover:bg-primary/4 rounded-xl text-left transition-all"
          >
            <div className="p-2.5 rounded-lg bg-muted text-muted-foreground w-fit">
              <PenLine size={22} />
            </div>
            <div>
              <p className="font-semibold text-sm">Enter Manually</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Type in the vendor, invoice number, and line items yourself
              </p>
            </div>
          </button>
        </div>
      </div>
    );
  }

  // ── Mode: manual ──────────────────────────────────────────
  if (mode === "manual") {
    return (
      <div className="max-w-xl">
        <div className="flex items-center gap-3 mb-6">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setMode("choose")}
            data-testid="button-back"
          >
            <ArrowLeft size={16} />
          </Button>
          <div>
            <h1 className="text-xl font-semibold">New Invoice</h1>
            <p className="text-sm text-muted-foreground">Enter invoice details manually</p>
          </div>
        </div>

        <div className="bg-card border border-border rounded-xl p-6">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSubmitManual)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="vendor"
                  render={({ field }) => (
                    <FormItem className="col-span-2">
                      <FormLabel>Vendor / Supplier</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. Sysco Foods" data-testid="input-vendor" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="invoiceNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Invoice #</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. 2024-001" data-testid="input-invoice-number" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="invoiceDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Invoice Date</FormLabel>
                      <FormControl>
                        <Input type="date" data-testid="input-invoice-date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem className="col-span-2">
                      <FormLabel>Notes (optional)</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Any additional notes..."
                          className="resize-none"
                          rows={2}
                          data-testid="input-notes"
                          {...field}
                          value={field.value ?? ""}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="flex gap-3 pt-2">
                <Button
                  type="submit"
                  disabled={mutation.isPending}
                  className="flex-1"
                  data-testid="button-submit-invoice"
                >
                  {mutation.isPending ? "Saving..." : "Create Invoice & Add Items"}
                </Button>
                <Button type="button" variant="outline" onClick={() => setMode("choose")} data-testid="button-cancel">
                  Cancel
                </Button>
              </div>
            </form>
          </Form>
        </div>
      </div>
    );
  }

  // ── Mode: pdf-preview ─────────────────────────────────────
  return (
    <div className="max-w-3xl">
      <div className="flex items-center gap-3 mb-6">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => { setMode("choose"); setParsedData(null); setParsedItems([]); }}
          data-testid="button-back"
        >
          <ArrowLeft size={16} />
        </Button>
        <div>
          <h1 className="text-xl font-semibold">Upload Invoice PDF</h1>
          <p className="text-sm text-muted-foreground">
            {parsedData ? "Review and confirm extracted data" : "AI will read and extract all line items"}
          </p>
        </div>
      </div>

      {!parsedData ? (
        /* Step 1: Upload */
        <div className="bg-card border border-border rounded-xl p-6">
          <PdfUploader onParsed={handleParsed} />
        </div>
      ) : (
        /* Step 2: Review extracted data */
        <div className="space-y-4">
          {/* Success banner */}
          <div className="flex items-center gap-3 p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-800 dark:text-green-300 text-sm">
            <CheckCircle2 size={16} className="shrink-0" />
            <span>
              AI extracted <strong>{parsedItems.length} line items</strong> from your invoice. Review below and import.
            </span>
          </div>

          {/* Invoice header (editable) */}
          <div className="bg-card border border-border rounded-xl p-5">
            <h3 className="font-semibold text-sm mb-4 flex items-center gap-2">
              <Edit2 size={13} className="text-primary" />
              Invoice Details
              <span className="text-xs font-normal text-muted-foreground">(edit if needed)</span>
            </h3>
            <Form {...form}>
              <div className="grid grid-cols-2 gap-3">
                <FormField
                  control={form.control}
                  name="vendor"
                  render={({ field }) => (
                    <FormItem className="col-span-2">
                      <FormLabel className="text-xs">Vendor</FormLabel>
                      <FormControl>
                        <Input data-testid="input-vendor" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="invoiceNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">Invoice #</FormLabel>
                      <FormControl>
                        <Input data-testid="input-invoice-number" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="invoiceDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">Date</FormLabel>
                      <FormControl>
                        <Input type="date" data-testid="input-invoice-date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem className="col-span-2">
                      <FormLabel className="text-xs">Notes</FormLabel>
                      <FormControl>
                        <Input data-testid="input-notes" {...field} value={field.value ?? ""} />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>
            </Form>
          </div>

          {/* Line items preview */}
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 bg-muted/30 border-b border-border">
              <h3 className="font-semibold text-sm">Extracted Line Items</h3>
              <span className="text-xs text-muted-foreground">
                {parsedItems.length} items · ${parsedItems.reduce((s, i) => s + i.totalCost, 0).toFixed(2)} total
              </span>
            </div>

            {parsedItems.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                No items remaining. You can still import the invoice header and add items manually.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-muted-foreground uppercase tracking-wide border-b border-border/50">
                      <th className="py-2 px-4 text-left font-medium">Item</th>
                      <th className="py-2 px-4 text-left font-medium">Category</th>
                      <th className="py-2 px-4 text-right font-medium">Total Cost</th>
                      <th className="py-2 px-4 text-right font-medium">Qty / Unit</th>
                      <th className="py-2 px-4 text-right font-medium">Cost / Unit</th>
                      <th className="py-2 px-4"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsedItems.map((item, idx) => {
                      const cpu =
                        item.packSize && item.packUnit
                          ? item.totalCost / (item.quantity * item.packSize)
                          : item.totalCost / item.quantity;
                      const label =
                        item.packSize && item.packUnit ? `/${item.packUnit}` : `/${item.unit}`;
                      const color = CATEGORY_COLORS[item.category] ?? "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300";

                      return (
                        <tr
                          key={idx}
                          className="border-b border-border/30 hover:bg-muted/20 transition-colors group"
                          data-testid={`row-preview-item-${idx}`}
                        >
                          <td className="py-2.5 px-4">
                            <div className="font-medium">{item.itemName}</div>
                            {item.notes && <div className="text-xs text-muted-foreground">{item.notes}</div>}
                          </td>
                          <td className="py-2.5 px-4">
                            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>
                              {item.category}
                            </span>
                          </td>
                          <td className="py-2.5 px-4 text-right tabular-nums">${item.totalCost.toFixed(2)}</td>
                          <td className="py-2.5 px-4 text-right tabular-nums text-muted-foreground">
                            {item.quantity} {item.unit}
                            {item.packSize && item.packUnit && (
                              <span className="block text-xs">× {item.packSize} {item.packUnit}</span>
                            )}
                          </td>
                          <td className="py-2.5 px-4 text-right">
                            <span className="font-semibold text-primary tabular-nums">
                              ${cpu.toFixed(4)}{label}
                            </span>
                          </td>
                          <td className="py-2.5 px-4 text-right">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                              onClick={() => handleRemoveItem(idx)}
                              data-testid={`button-remove-preview-item-${idx}`}
                            >
                              <Trash2 size={13} />
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <Button
              onClick={handleSubmitPdf}
              disabled={mutation.isPending}
              className="flex-1"
              data-testid="button-import-invoice"
            >
              {mutation.isPending
                ? "Importing..."
                : `Import Invoice & ${parsedItems.length} Items`}
            </Button>
            <Button
              variant="outline"
              onClick={() => { setParsedData(null); setParsedItems([]); }}
              data-testid="button-re-upload"
            >
              Try Different PDF
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
