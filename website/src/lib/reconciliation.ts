import {
  MATCH_CONFIDENCE_HIGH,
  MATCH_CONFIDENCE_MID,
} from "./constants";
import type { BankTransactionMatchStatus, StatusBadgeVariant } from "@/types";

export type MatchConfidenceTier = "high" | "mid" | "low";

export function matchConfidenceTier(confidence: number | null | undefined): MatchConfidenceTier {
  if (typeof confidence !== "number" || !Number.isFinite(confidence)) return "low";
  if (confidence >= MATCH_CONFIDENCE_HIGH) return "high";
  if (confidence >= MATCH_CONFIDENCE_MID) return "mid";
  return "low";
}

/**
 * Pill variant for a transaction row — collapses match status + confidence
 * into the single visual treatment used by `MatchPill`. `ignored` always
 * trumps confidence; otherwise `unmatched` falls back to the confidence
 * tier so suggested-but-unconfirmed matches still show their tint.
 */
export function matchPillVariant(
  status: BankTransactionMatchStatus,
  confidence: number | null | undefined,
): StatusBadgeVariant {
  if (status === "ignored") return "danger";
  if (status === "matched" || status === "split") return "success";
  const tier = matchConfidenceTier(confidence);
  if (tier === "high") return "success";
  if (tier === "mid") return "warning";
  return "neutral";
}

export function sumSplitAmountsCents(
  splits: ReadonlyArray<{ amountCents: number }>,
): number {
  return splits.reduce((acc, s) => acc + (Number.isFinite(s.amountCents) ? s.amountCents : 0), 0);
}
