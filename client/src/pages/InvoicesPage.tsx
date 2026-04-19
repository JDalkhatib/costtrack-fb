import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { queryClient, apiRequest, API_BASE } from "@/lib/queryClient";
import { getAuthToken } from "@/lib/auth";
import type { Invoice } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FileText, Trash2, ChevronRight, PlusCircle, Calendar, Building2, Download, Loader2, Mail, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

// Build list of YYYY-MM options going back 24 months
function getMonthOptions() {
  const options: { value: string; label: string }[] = [];
  const now = new Date();
  for (let i = 0; i < 24; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    options.push({
      value: format(d, "yyyy-MM"),
      label: format(d, "MMMM yyyy"),
    });
  }
  return options;
}

export default function InvoicesPage() {
  const { toast } = useToast();
  const [exportPopoverOpen, setExportPopoverOpen] = useState(false);
  const [exportMonth, setExportMonth] = useState<string>(format(new Date(), "yyyy-MM"));
  const [isExporting, setIsExporting] = useState(false);
  const monthOptions = getMonthOptions();

  // Auto-import notifications
  const [dismissedImports, setDismissedImports] = useState<number[]>([]);
  const { data: recentImports } = useQuery<any[]>({
    queryKey: ["/api/auto-imports/recent"],
    refetchInterval: 5 * 60 * 1000, // refresh every 5 min
    staleTime: 60_000,
  });
  const newImports = (recentImports ?? []).filter((r) => {
    if (dismissedImports.includes(r.id)) return false;
    const age = Date.now() - new Date(r.received_at).getTime();
    return age < 24 * 60 * 60 * 1000; // only show if within last 24h
  });

  const { data: invoices, isLoading } = useQuery<Invoice[]>({
    queryKey: ["/api/invoices"],
  });

  async function handleExport(month: string | "all") {
    setIsExporting(true);
    try {
      const params = month !== "all" ? `?month=${month}` : "";
      const token = getAuthToken();
      const url = `${API_BASE}/api/export${params}`;
      const resp = await fetch(url, {
        headers: token ? { "x-auth-token": token } : {},
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error ?? "Export failed");
      }
      const blob = await resp.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      const label = month !== "all" ? `_${month}` : "_all-time";
      a.download = `costtrack-spend${label}.xlsx`;
      a.click();
      URL.revokeObjectURL(a.href);
      setExportPopoverOpen(false);
      toast({ title: "Export ready", description: "Your spreadsheet has been downloaded." });
    } catch (err: any) {
      toast({ title: "Export failed", description: err?.message ?? "Unknown error", variant: "destructive" });
    } finally {
      setIsExporting(false);
    }
  }

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/invoices/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      toast({ title: "Invoice deleted" });
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between mb-6">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-9 w-32" />
        </div>
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-20 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div>

      {/* Auto-import notifications */}
      {newImports.length > 0 && (
        <div className="space-y-2 mb-5">
          {newImports.map((imp) => (
            <div
              key={imp.id}
              className="flex items-center gap-3 px-4 py-3 rounded-lg bg-primary/10 border border-primary/20 text-sm"
            >
              <Mail size={15} className="text-primary shrink-0" />
              <span className="flex-1">
                <span className="font-medium">New invoice auto-imported</span>
                {" "}from your email
                {imp.subject ? (
                  <span className="text-muted-foreground"> &middot; &ldquo;{imp.subject}&rdquo;</span>
                ) : null}
                {imp.invoice_id ? (
                  <Link href={`/invoices/${imp.invoice_id}`} className="ml-2 text-primary underline underline-offset-2">
                    View &rarr;
                  </Link>
                ) : null}
              </span>
              <button
                onClick={() => setDismissedImports((d) => [...d, imp.id])}
                className="text-muted-foreground hover:text-foreground"
              >
                <X size={13} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold">Invoices</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {invoices?.length ?? 0} invoice{invoices?.length !== 1 ? "s" : ""} on record
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Export button */}
          <Popover open={exportPopoverOpen} onOpenChange={setExportPopoverOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                data-testid="button-export"
                disabled={isExporting}
              >
                {isExporting ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Download size={14} />
                )}
                Export
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72 p-4" align="end">
              <p className="text-sm font-semibold mb-1">Export to Spreadsheet</p>
              <p className="text-xs text-muted-foreground mb-3">
                Downloads a 4-sheet Excel workbook: Summary, All Items, Food Spend, and Kitchen Supplies.
              </p>
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1 block">
                    Month
                  </label>
                  <Select value={exportMonth} onValueChange={setExportMonth}>
                    <SelectTrigger className="w-full h-8 text-sm" data-testid="select-export-month">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {monthOptions.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-2">
                  <Button
                    size="sm"
                    className="w-full gap-1.5"
                    onClick={() => handleExport(exportMonth)}
                    disabled={isExporting}
                    data-testid="button-export-month"
                  >
                    {isExporting ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
                    Export {monthOptions.find(o => o.value === exportMonth)?.label}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full gap-1.5"
                    onClick={() => handleExport("all")}
                    disabled={isExporting}
                    data-testid="button-export-all"
                  >
                    <Download size={12} />
                    Export All Time
                  </Button>
                </div>
              </div>
            </PopoverContent>
          </Popover>

          <Link href="/invoices/new">
            <Button size="sm" className="gap-1.5" data-testid="button-add-invoice">
              <PlusCircle size={14} />
              New Invoice
            </Button>
          </Link>
        </div>
      </div>

      {!invoices?.length ? (
        <div className="flex flex-col items-center justify-center py-20 text-center border border-dashed border-border rounded-xl bg-muted/30">
          <FileText size={40} className="text-muted-foreground mb-3" />
          <p className="font-medium text-muted-foreground">No invoices yet</p>
          <p className="text-sm text-muted-foreground mt-1 mb-4">Add your first invoice to start tracking costs</p>
          <Link href="/invoices/new">
            <Button size="sm" className="gap-1.5">
              <PlusCircle size={14} />
              New Invoice
            </Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-2">
          {invoices.map((invoice) => (
            <div
              key={invoice.id}
              className="group flex items-center gap-4 p-4 bg-card border border-border rounded-lg hover:border-primary/40 transition-colors"
              data-testid={`card-invoice-${invoice.id}`}
            >
              <div className="p-2 rounded-md bg-primary/10 text-primary shrink-0">
                <FileText size={18} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-sm" data-testid={`text-invoice-vendor-${invoice.id}`}>
                    {invoice.vendor}
                  </span>
                  <Badge variant="outline" className="text-xs">
                    #{invoice.invoiceNumber}
                  </Badge>
                </div>
                <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Calendar size={11} />
                    {format(new Date(invoice.invoiceDate), "MMM d, yyyy")}
                  </span>
                  {invoice.notes && (
                    <span className="truncate max-w-[200px]">{invoice.notes}</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Link href={`/invoices/${invoice.id}`}>
                  <Button variant="ghost" size="sm" className="gap-1.5" data-testid={`button-view-invoice-${invoice.id}`}>
                    View
                    <ChevronRight size={14} />
                  </Button>
                </Link>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      data-testid={`button-delete-invoice-${invoice.id}`}
                    >
                      <Trash2 size={14} />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete Invoice?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will permanently delete invoice #{invoice.invoiceNumber} from {invoice.vendor} and all its line items.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => deleteMutation.mutate(invoice.id)}
                        className="bg-destructive hover:bg-destructive/90"
                      >
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
