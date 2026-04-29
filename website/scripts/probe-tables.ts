/**
 * scripts/probe-tables.ts
 *
 * Probes the active Supabase project for the existence of every table the
 * Owner Cockpit reads. Run before query code lands so feature work knows
 * which tables need `safe()` fallbacks (see SPEC.md §3).
 *
 * Usage:
 *   npm run probe:tables
 *
 * Reads NEXT_PUBLIC_SUPABASE_URL and a key from env. Prefers
 * SUPABASE_SERVICE_ROLE_KEY (bypasses RLS so empty tables still report
 * existence) and falls back to NEXT_PUBLIC_SUPABASE_ANON_KEY.
 *
 * Exit code is always 0 — this is a diagnostic, not a gate.
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  UNVERIFIED_TABLES,
  VERIFIED_TABLES,
  type TableProbeResult,
} from "../src/types/database";

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

async function probeTable(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any,
  table: string,
): Promise<TableProbeResult> {
  const missingPattern =
    /does not exist|relation .* does not exist|schema cache/i;

  const { count, error } = await client
    .from(table)
    .select("*", { count: "exact", head: true });

  if (error) {
    const message = String(error.message ?? error);
    return {
      table,
      exists: !missingPattern.test(message),
      rowCount: null,
      error: message,
    };
  }

  // PostgREST HEAD requests strip the response body, so supabase-js can return
  // `error=null, count=null` for tables that actually 404. Fall back to a
  // body-returning select to disambiguate "RLS hides count" from "table absent".
  if (count === null) {
    const probe = await client.from(table).select("*").limit(0);
    if (probe.error) {
      const message = String(probe.error.message ?? probe.error);
      return {
        table,
        exists: !missingPattern.test(message),
        rowCount: null,
        error: message,
      };
    }
    return { table, exists: true, rowCount: null, error: null };
  }

  return {
    table,
    exists: true,
    rowCount: count,
    error: null,
  };
}

function pad(value: string, width: number): string {
  return value.length >= width ? value : value + " ".repeat(width - value.length);
}

function printReport(
  title: string,
  results: TableProbeResult[],
): void {
  const tableWidth = Math.max(
    title.length,
    ...results.map((r) => r.table.length),
  );
  console.log("");
  console.log(title);
  console.log("-".repeat(tableWidth + 22));
  for (const r of results) {
    const status = r.exists ? "OK " : "MISSING";
    const rows = r.rowCount === null ? "    -" : String(r.rowCount).padStart(5);
    const note = r.exists ? "" : `  (${r.error ?? "absent"})`;
    console.log(`${pad(r.table, tableWidth)}  ${status}  rows=${rows}${note}`);
  }
}

async function main(): Promise<void> {
  loadDotEnvLocal();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    console.error(
      "[probe-tables] NEXT_PUBLIC_SUPABASE_URL and a Supabase key are required " +
        "(SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY).",
    );
    process.exitCode = 0;
    return;
  }

  const usingServiceRole = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
  console.log(
    `[probe-tables] target=${url} key=${usingServiceRole ? "service-role" : "anon"}`,
  );

  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const verified = await Promise.all(
    VERIFIED_TABLES.map((t) => probeTable(client, t)),
  );
  const unverified = await Promise.all(
    UNVERIFIED_TABLES.map((t) => probeTable(client, t)),
  );

  printReport("Verified tables (should all be OK):", verified);
  printReport("Unverified tables (drive `safe()` fallbacks):", unverified);

  const missingVerified = verified.filter((r) => !r.exists);
  const missingUnverified = unverified.filter((r) => !r.exists);

  console.log("");
  console.log(
    `Summary: ${verified.length - missingVerified.length}/${verified.length} verified present, ` +
      `${unverified.length - missingUnverified.length}/${unverified.length} unverified present.`,
  );

  if (missingVerified.length > 0) {
    console.log("");
    console.warn(
      "WARNING: missing verified tables — feature contracts assume these exist:",
    );
    for (const r of missingVerified) console.warn(`  - ${r.table}`);
  }

  if (missingUnverified.length > 0) {
    console.log("");
    console.log("Fallbacks active for:");
    for (const r of missingUnverified) console.log(`  - ${r.table}`);
  }
}

main().catch((err) => {
  console.error("[probe-tables] fatal:", err);
  process.exitCode = 0;
});
