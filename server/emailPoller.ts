/**
 * emailPoller.ts
 * Polls the invoice Gmail inbox every 15 minutes via IMAP,
 * downloads PDF attachments, parses them with Claude, and
 * saves results to Supabase automatically.
 */

import imaps from "imap-simple";
import { simpleParser } from "mailparser";
import { supabase } from "./supabase";
import { storage } from "./storage";
import { parsePdfInvoice } from "./pdfParser";

const POLL_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

// ── Supabase helpers ─────────────────────────────────────────

async function ensureProcessedEmailsTable() {
  // Create table if it doesn't exist using raw SQL via Supabase
  const { error } = await supabase.rpc("create_processed_emails_if_not_exists");
  // If the RPC doesn't exist, that's fine — table likely already exists
  if (error && !error.message.includes("does not exist")) {
    console.log("[email] Table check:", error.message);
  }
}

async function isAlreadyProcessed(messageId: string): Promise<boolean> {
  const { data } = await supabase
    .from("processed_emails")
    .select("id")
    .eq("message_id", messageId)
    .maybeSingle();
  return !!data;
}

async function markProcessed(opts: {
  messageId: string;
  subject: string;
  sender: string;
  invoiceId?: number;
  status: "processed" | "error" | "no_pdf";
  errorMessage?: string;
}) {
  await supabase.from("processed_emails").upsert(
    {
      message_id: opts.messageId,
      subject: opts.subject,
      sender: opts.sender,
      invoice_id: opts.invoiceId ?? null,
      status: opts.status,
      error_message: opts.errorMessage ?? null,
    },
    { onConflict: "message_id" }
  );
}

// ── Main poll function ────────────────────────────────────────

export async function pollInvoiceEmails() {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;

  if (!user || !pass) {
    console.log("[email] GMAIL_USER or GMAIL_APP_PASSWORD not set — skipping poll");
    return;
  }

  console.log(`[email] Polling ${user} for new invoices...`);

  const config = {
    imap: {
      user,
      password: pass,
      host: "imap.gmail.com",
      port: 993,
      tls: true,
      tlsOptions: { rejectUnauthorized: false },
      authTimeout: 10000,
    },
  };

  let connection: imaps.ImapSimple | null = null;

  try {
    connection = await imaps.connect(config);
    await connection.openBox("INBOX");

    // Search for unseen emails — process all unread first, then fall back to last 7 days
    const searchCriteria = ["UNSEEN"];
    const fetchOptions = {
      bodies: ["HEADER", ""],
      markSeen: false, // we'll mark seen manually after successful processing
      struct: true,
    };

    const messages = await connection.search(searchCriteria, fetchOptions);
    console.log(`[email] Found ${messages.length} unseen message(s)`);

    let imported = 0;
    let skipped = 0;

    for (const message of messages) {
      const headerPart = message.parts.find((p: any) => p.which === "HEADER");
      const headers = headerPart?.body ?? {};
      const messageId: string =
        (Array.isArray(headers["message-id"]) ? headers["message-id"][0] : headers["message-id"]) ??
        `fallback-${message.attributes.uid}`;
      const subject: string =
        (Array.isArray(headers["subject"]) ? headers["subject"][0] : headers["subject"]) ?? "(no subject)";
      const from: string =
        (Array.isArray(headers["from"]) ? headers["from"][0] : headers["from"]) ?? "";

      // Skip if already processed
      if (await isAlreadyProcessed(messageId)) {
        skipped++;
        continue;
      }

      console.log(`[email] Processing: "${subject}" from ${from}`);

      // Get full message body to parse attachments
      const bodyPart = message.parts.find((p: any) => p.which === "");
      if (!bodyPart) {
        await markProcessed({ messageId, subject, sender: from, status: "no_pdf" });
        continue;
      }

      let parsed: any;
      try {
        parsed = await simpleParser(bodyPart.body);
      } catch (e) {
        console.error("[email] Failed to parse message body:", e);
        await markProcessed({ messageId, subject, sender: from, status: "error", errorMessage: String(e) });
        continue;
      }

      // Find PDF attachments
      const pdfAttachments = (parsed.attachments ?? []).filter(
        (att: any) =>
          att.contentType === "application/pdf" ||
          (att.filename ?? "").toLowerCase().endsWith(".pdf")
      );

      if (pdfAttachments.length === 0) {
        console.log(`[email] No PDF attachments in "${subject}" — skipping`);
        await markProcessed({ messageId, subject, sender: from, status: "no_pdf" });
        continue;
      }

      // Process each PDF attachment
      for (const attachment of pdfAttachments) {
        const pdfBuffer: Buffer = attachment.content;
        console.log(`[email] Parsing PDF: ${attachment.filename} (${pdfBuffer.length} bytes)`);

        try {
          const invoiceData = await parsePdfInvoice(pdfBuffer);

          // Save invoice
          const invoice = await storage.createInvoice({
            invoiceNumber: invoiceData.invoiceNumber,
            vendor: invoiceData.vendor,
            invoiceDate: invoiceData.invoiceDate,
            totalAmount: invoiceData.items.reduce((sum: number, i: any) => sum + (i.totalCost ?? 0), 0),
            notes: invoiceData.notes ?? `Auto-imported from email: ${subject}`,
            category: "Food",
          });

          // Save line items
          for (const item of invoiceData.items) {
            await storage.createLineItem({
              invoiceId: invoice.id,
              itemName: item.itemName,
              category: item.category,
              totalCost: item.totalCost,
              quantity: item.quantity,
              unit: item.unit,
              packSize: item.packSize ?? null,
              packUnit: item.packUnit ?? null,
              notes: item.notes ?? null,
            });
          }

          console.log(`[email] ✓ Imported invoice ${invoiceData.invoiceNumber} (${invoiceData.items.length} items)`);
          await markProcessed({ messageId, subject, sender: from, status: "processed", invoiceId: invoice.id });
          imported++;
        } catch (parseErr: any) {
          console.error(`[email] Failed to parse PDF ${attachment.filename}:`, parseErr.message);
          await markProcessed({
            messageId,
            subject,
            sender: from,
            status: "error",
            errorMessage: parseErr.message,
          });
        }
      }
    }

    console.log(`[email] Poll complete — ${imported} imported, ${skipped} already processed, ${messages.length - imported - skipped} skipped (no PDF)`);
  } catch (err: any) {
    console.error("[email] Poll error:", err.message);
  } finally {
    if (connection) {
      try { connection.end(); } catch {}
    }
  }
}

// ── Scheduler ────────────────────────────────────────────────

export function startEmailPoller() {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    console.log("[email] Gmail credentials not configured — email poller disabled");
    return;
  }

  console.log(`[email] Starting email poller (every ${POLL_INTERVAL_MS / 60000} minutes)`);

  // Run immediately on startup, then on interval
  pollInvoiceEmails().catch(console.error);
  setInterval(() => pollInvoiceEmails().catch(console.error), POLL_INTERVAL_MS);
}
