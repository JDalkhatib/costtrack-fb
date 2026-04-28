/**
 * emailPoller.ts
 * Polls the invoice Gmail inbox every 15 minutes via IMAP,
 * downloads PDF attachments, parses them with Claude, and
 * saves results to Supabase automatically.
 */

import imaps from "imap-simple";
import { simpleParser } from "mailparser";
import supabase from "./supabase";
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

// ── Poll a single inbox ───────────────────────────────────────

async function pollInbox(user: string, pass: string, restaurantId: number | null, label: string) {
  console.log(`[email] Polling ${label} (${user})...`);

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

    // Search ALL messages — we track what's been processed via processed_emails table,
    // so we don't rely on the UNSEEN flag (Gmail sometimes doesn't set it reliably).
    // Only look at the last 90 days to cap the search window.
    const since = new Date();
    since.setDate(since.getDate() - 90);
    const messages = await connection.search([["SINCE", since.toDateString()]], {
      bodies: ["HEADER", ""],
      markSeen: false,
      struct: true,
    });
    console.log(`[email] ${label}: ${messages.length} message(s) in last 90 days`);

    let imported = 0;
    let skipped = 0;

    for (const message of messages) {
      const headerPart = message.parts.find((p: any) => p.which === "HEADER");
      const headers = headerPart?.body ?? {};
      const messageId: string =
        (Array.isArray(headers["message-id"]) ? headers["message-id"][0] : headers["message-id"]) ??
        `fallback-${user}-${message.attributes.uid}`;
      const subject: string =
        (Array.isArray(headers["subject"]) ? headers["subject"][0] : headers["subject"]) ?? "(no subject)";
      const from: string =
        (Array.isArray(headers["from"]) ? headers["from"][0] : headers["from"]) ?? "";

      if (await isAlreadyProcessed(messageId)) { skipped++; continue; }

      console.log(`[email] Processing: "${subject}" from ${from}`);

      const bodyPart = message.parts.find((p: any) => p.which === "");
      if (!bodyPart) {
        await markProcessed({ messageId, subject, sender: from, status: "no_pdf" });
        continue;
      }

      let parsed: any;
      try {
        parsed = await simpleParser(bodyPart.body);
      } catch (e) {
        await markProcessed({ messageId, subject, sender: from, status: "error", errorMessage: String(e) });
        continue;
      }

      const pdfAttachments = (parsed.attachments ?? []).filter(
        (att: any) => att.contentType === "application/pdf" || (att.filename ?? "").toLowerCase().endsWith(".pdf")
      );

      if (pdfAttachments.length === 0) {
        await markProcessed({ messageId, subject, sender: from, status: "no_pdf" });
        continue;
      }

      for (const attachment of pdfAttachments) {
        const pdfBuffer: Buffer = attachment.content;
        try {
          const invoiceData = await parsePdfInvoice(pdfBuffer);

          // Dedup: skip if an invoice with the same number+vendor already exists
          // - For restaurant-scoped inboxes: check within that restaurant
          // - For global inbox (restaurantId=null): check across ALL restaurants to
          //   prevent creating null-restaurant duplicates of already-imported invoices
          const dupQuery = supabase
            .from("invoices")
            .select("id, restaurant_id")
            .eq("invoice_number", invoiceData.invoiceNumber)
            .eq("vendor", invoiceData.vendor);
          if (restaurantId !== null) {
            dupQuery.eq("restaurant_id", restaurantId);
          }
          // For global (null), no restaurant filter — match any existing invoice
          const { data: existing } = await dupQuery.maybeSingle();
          if (existing) {
            console.log(`[email] ${label}: Skipping duplicate invoice ${invoiceData.invoiceNumber} (already exists, id=${existing.id})`);
            await markProcessed({ messageId, subject, sender: from, status: "processed", invoiceId: existing.id });
            continue;
          }

          const invoice = await storage.createInvoice({
            invoiceNumber: invoiceData.invoiceNumber,
            vendor: invoiceData.vendor,
            invoiceDate: invoiceData.invoiceDate,
            notes: invoiceData.notes ?? `Auto-imported from email: ${subject}`,
          }, restaurantId);

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

          console.log(`[email] ✓ ${label}: Imported invoice ${invoiceData.invoiceNumber} (${invoiceData.items.length} items)`);
          await markProcessed({ messageId, subject, sender: from, status: "processed", invoiceId: invoice.id });
          imported++;
        } catch (parseErr: any) {
          console.error(`[email] Failed to parse PDF:`, parseErr.message);
          await markProcessed({ messageId, subject, sender: from, status: "error", errorMessage: parseErr.message });
        }
      }
    }

    console.log(`[email] ${label}: ${imported} imported, ${skipped} already processed`);
  } catch (err: any) {
    console.error(`[email] Poll error for ${label}:`, err.message);
  } finally {
    if (connection) { try { connection.end(); } catch {} }
  }
}

// ── Main poll function — polls all inboxes ─────────────────────

export async function pollInvoiceEmails() {
  const inboxes: { user: string; pass: string; restaurantId: number | null; label: string }[] = [];

  // Global inbox from env vars (admin-level, no restaurant)
  const globalUser = process.env.GMAIL_USER;
  const globalPass = process.env.GMAIL_APP_PASSWORD;
  if (globalUser && globalPass) {
    inboxes.push({ user: globalUser, pass: globalPass, restaurantId: null, label: "Global" });
  }

  // Per-restaurant inboxes from database
  try {
    const restaurants = await storage.getRestaurants();
    for (const r of restaurants) {
      if (r.active && r.gmailUser && r.gmailAppPassword) {
        inboxes.push({ user: r.gmailUser, pass: r.gmailAppPassword, restaurantId: r.id, label: r.name });
      }
    }
  } catch (e) {
    console.error("[email] Could not load restaurant inboxes:", e);
  }

  if (inboxes.length === 0) {
    console.log("[email] No inboxes configured — skipping poll");
    return;
  }

  // De-duplicate: if a restaurant inbox uses the same address as the global inbox,
  // prefer the restaurant-scoped entry (has restaurantId) and drop the global one.
  const restaurantEmails = new Set(
    inboxes.filter((i) => i.restaurantId !== null).map((i) => i.user.toLowerCase())
  );
  const deduped = inboxes.filter(
    (i) => i.restaurantId !== null || !restaurantEmails.has(i.user.toLowerCase())
  );

  console.log(`[email] Polling ${deduped.length} inbox(es)...`);
  // Poll all inboxes in parallel
  await Promise.allSettled(deduped.map((inbox) => pollInbox(inbox.user, inbox.pass, inbox.restaurantId, inbox.label)));
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
