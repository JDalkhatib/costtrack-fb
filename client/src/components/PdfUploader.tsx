import { useState, useRef, useCallback } from "react";
import { Upload, FileText, Loader2, Sparkles, AlertCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { API_BASE } from "@/lib/queryClient";
import { getAuthToken } from "@/lib/auth";

interface ParsedLineItem {
  itemName: string;
  category: string;
  totalCost: number;
  quantity: number;
  unit: string;
  packSize?: number | null;
  packUnit?: string | null;
  notes?: string | null;
}

export interface ParsedInvoice {
  vendor: string;
  invoiceNumber: string;
  invoiceDate: string;
  notes?: string | null;
  items: ParsedLineItem[];
}

interface PdfUploaderProps {
  onParsed: (data: ParsedInvoice) => void;
}

export function PdfUploader({ onParsed }: PdfUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback(
    async (file: File) => {
      if (file.type !== "application/pdf") {
        setError("Please upload a PDF file.");
        return;
      }
      if (file.size > 20 * 1024 * 1024) {
        setError("File is too large. Max 20MB.");
        return;
      }

      setError(null);
      setFileName(file.name);
      setIsLoading(true);

      try {
        const formData = new FormData();
        formData.append("file", file);

        const token = getAuthToken();
        const res = await fetch(
          `${API_BASE}/api/parse-invoice-pdf`,
          {
            method: "POST",
            body: formData,
            headers: token ? { "x-auth-token": token } : {},
          }
        );

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error ?? `Server error ${res.status}`);
        }

        const data: ParsedInvoice = await res.json();
        onParsed(data);
      } catch (err: any) {
        setError(err.message ?? "Failed to parse invoice. Please try again.");
        setFileName(null);
      } finally {
        setIsLoading(false);
      }
    },
    [onParsed]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) processFile(file);
    },
    [processFile]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) processFile(file);
      // Reset so same file can be re-uploaded
      e.target.value = "";
    },
    [processFile]
  );

  return (
    <div className="space-y-3">
      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => !isLoading && inputRef.current?.click()}
        data-testid="pdf-dropzone"
        className={`
          relative flex flex-col items-center justify-center gap-3 p-8 rounded-xl border-2 border-dashed
          transition-all cursor-pointer select-none
          ${isDragging
            ? "border-primary bg-primary/8 scale-[1.01]"
            : "border-border hover:border-primary/50 hover:bg-muted/30"
          }
          ${isLoading ? "pointer-events-none opacity-70" : ""}
        `}
      >
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={handleChange}
          data-testid="input-pdf-file"
        />

        {isLoading ? (
          <>
            <div className="p-3 rounded-full bg-primary/10">
              <Loader2 size={28} className="text-primary animate-spin" />
            </div>
            <div className="text-center">
              <p className="font-semibold text-sm">Reading invoice with AI...</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Extracting line items, costs, and vendor info
              </p>
            </div>
          </>
        ) : fileName ? (
          <>
            <div className="p-3 rounded-full bg-green-100 dark:bg-green-900/30">
              <FileText size={28} className="text-green-600 dark:text-green-400" />
            </div>
            <div className="text-center">
              <p className="font-semibold text-sm">{fileName}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Click or drop to replace</p>
            </div>
          </>
        ) : (
          <>
            <div className="p-3 rounded-full bg-primary/10">
              <Upload size={28} className="text-primary" />
            </div>
            <div className="text-center">
              <p className="font-semibold text-sm">Drop your invoice PDF here</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                or <span className="text-primary underline-offset-2 hover:underline">browse to upload</span> — up to 20MB
              </p>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/8 border border-primary/20 text-xs text-primary font-medium">
              <Sparkles size={11} />
              AI-powered extraction
            </div>
          </>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
          <AlertCircle size={15} className="shrink-0 mt-0.5" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="shrink-0">
            <X size={13} />
          </button>
        </div>
      )}
    </div>
  );
}
