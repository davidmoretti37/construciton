/**
 * scripts/probe-columns.ts
 *
 * Probes specific column existence via PostgREST select queries. The anon key
 * cannot reach `/rest/v1/` (OpenAPI root requires service_role), so this
 * issues a `select(<column>)?limit=0` request per column and treats any
 * "column ... does not exist" error as a missing column.
 *
 * Used during Database Schema setup to verify shape claims that
 * `probe-tables.ts` cannot answer:
 *   - `invoices.line_items` shape (jsonb array vs join table)
 *   - cents-vs-dollars convention for `invoices.total` / `amount_paid`
 *     (not provable from existence alone — flagged in interface comments)
 *   - presence of `signatures.user_id` (required for realtime filter)
 *
 * Reads NEXT_PUBLIC_SUPABASE_URL + a key from .env.local. Exit always 0.
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

interface ColumnProbe {
  table: string;
  columns: string[];
}

const PROBES: ColumnProbe[] = [
  {
    table: "invoices",
    columns: [
      "id",
      "user_id",
      "project_id",
      "client_id",
      "invoice_number",
      "total",
      "amount_paid",
      "status",
      "issued_at",
      "due_date",
      "paid_at",
      "line_items",
      "created_at",
    ],
  },
  {
    table: "estimates",
    columns: [
      "id",
      "user_id",
      "project_id",
      "client_id",
      "estimate_number",
      "status",
      "total",
      "line_items",
      "created_at",
    ],
  },
  {
    table: "payment_events",
    columns: [
      "id",
      "invoice_id",
      "amount",
      "kind",
      "occurred_at",
      "note",
      "created_at",
    ],
  },
  {
    table: "signatures",
    columns: [
      "id",
      "document_id",
      "document_type",
      "status",
      "signer_email",
      "signer_name",
      "token",
      "expires_at",
      "signed_at",
      "signature_png_url",
      "user_id",
      "created_at",
    ],
  },
  {
    table: "contracts",
    columns: [
      "id",
      "user_id",
      "project_id",
      "client_id",
      "title",
      "status",
      "template_id",
      "document_id",
      "body",
      "created_at",
    ],
  },
  {
    table: "contract_templates",
    columns: ["id", "user_id", "name", "body_markdown", "created_at"],
  },
  {
    table: "contract_documents",
    columns: [
      "id",
      "contract_id",
      "file_url",
      "file_name",
      "mime_type",
      "created_at",
    ],
  },
  {
    table: "clients",
    columns: ["id", "user_id", "full_name", "email", "phone", "created_at"],
  },
];

function loadDotEnvLocal(): void {
  const path = resolve(process.cwd(), ".env.local");
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return;
  }
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

async function probeColumn(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any,
  table: string,
  column: string,
): Promise<{ present: boolean; note: string }> {
  const { error } = await client.from(table).select(column).limit(0);
  if (!error) return { present: true, note: "" };
  const message = String(error.message ?? error);
  if (/column .* does not exist|does not match/i.test(message)) {
    return { present: false, note: "missing" };
  }
  if (/relation .* does not exist|schema cache/i.test(message)) {
    return { present: false, note: "table absent" };
  }
  // Some other error (RLS, network) — treat as inconclusive but not missing.
  return { present: true, note: `(rls?) ${message.slice(0, 60)}` };
}

async function main(): Promise<void> {
  loadDotEnvLocal();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    console.error("[probe-columns] missing env");
    return;
  }

  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  for (const probe of PROBES) {
    console.log("");
    console.log(`Table: ${probe.table}`);
    console.log("-".repeat(40 + probe.table.length));
    for (const column of probe.columns) {
      const r = await probeColumn(client, probe.table, column);
      const tag = r.present ? "OK     " : "MISSING";
      console.log(`  ${column.padEnd(28)}  ${tag}  ${r.note}`);
    }
  }
}

main().catch((err) => {
  console.error("[probe-columns] fatal:", err);
});
