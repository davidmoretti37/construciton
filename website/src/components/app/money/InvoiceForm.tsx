"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Label from "@/components/ui/Label";
import { useToast } from "@/components/ui/toast-provider";
import {
  createInvoice,
  updateInvoice,
  type InvoiceFormState,
} from "@/app/actions/invoices";
import type { DbInvoice, DbInvoiceLineItem } from "@/types/database";

interface Props {
  invoice?: DbInvoice | null;
  onSuccess?: (invoiceId: string) => void;
  onCancel?: () => void;
}

interface LineRow {
  description: string;
  quantity: string;
  unit_price: string;
}

const EMPTY_LINE: LineRow = { description: "", quantity: "1", unit_price: "0" };

const initial: InvoiceFormState = { ok: false };

export default function InvoiceForm({ invoice, onSuccess, onCancel }: Props) {
  const isEdit = Boolean(invoice?.id);
  const router = useRouter();
  const { toast } = useToast();

  const action = isEdit
    ? updateInvoice.bind(null, invoice!.id)
    : createInvoice;

  const [state, formAction, pending] = useActionState(action, initial);

  const [lines, setLines] = useState<LineRow[]>(() =>
    (invoice?.line_items ?? []).length > 0
      ? invoice!.line_items!.map((li) => ({
          description: li.description ?? "",
          quantity: String(li.quantity ?? 1),
          unit_price: String(li.unit_price ?? 0),
        }))
      : [EMPTY_LINE],
  );

  const [autoTotal, setAutoTotal] = useState<number>(() => deriveTotal(lines));

  useEffect(() => {
    setAutoTotal(deriveTotal(lines));
  }, [lines]);

  useEffect(() => {
    if (state.ok && state.invoiceId) {
      toast({
        title: isEdit ? "Invoice updated" : "Invoice created",
        variant: "success",
      });
      onSuccess?.(state.invoiceId);
      router.refresh();
    } else if (state.error) {
      toast({
        title: state.error,
        variant: "error",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  function lineItemsJson(): string {
    const items: DbInvoiceLineItem[] = lines
      .filter((l) => l.description.trim() !== "")
      .map((l) => ({
        description: l.description,
        quantity: Number(l.quantity) || 0,
        unit_price: Number(l.unit_price) || 0,
      }));
    return items.length > 0 ? JSON.stringify(items) : "";
  }

  function update(idx: number, patch: Partial<LineRow>) {
    setLines((prev) =>
      prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)),
    );
  }

  function addLine() {
    setLines((prev) => [...prev, { ...EMPTY_LINE }]);
  }

  function removeLine(idx: number) {
    setLines((prev) =>
      prev.length === 1 ? prev : prev.filter((_, i) => i !== idx),
    );
  }

  const errs = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="line_items" value={lineItemsJson()} />

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="invoice_number">Invoice number</Label>
          <Input
            id="invoice_number"
            name="invoice_number"
            defaultValue={invoice?.invoice_number ?? ""}
            placeholder="INV-1042"
            invalid={Boolean(errs.invoice_number)}
          />
          {errs.invoice_number && (
            <p className="text-[11px] text-[#c5251c] mt-1">{errs.invoice_number}</p>
          )}
        </div>
        <div>
          <Label htmlFor="status">Status</Label>
          <select
            id="status"
            name="status"
            defaultValue={invoice?.status ?? "draft"}
            className="w-full bg-white text-[#1d1d1f] ring-1 ring-inset ring-[#e5e5ea] rounded-[10px] h-10 px-3 text-[14px] focus:outline-none focus:ring-2 focus:ring-[#0071e3] transition-shadow"
          >
            {["draft", "sent", "viewed", "partial", "paid", "overdue", "void"].map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="issued_at">Issued</Label>
          <Input
            id="issued_at"
            name="issued_at"
            type="date"
            defaultValue={invoice?.issued_at ?? ""}
            invalid={Boolean(errs.issued_at)}
          />
          {errs.issued_at && (
            <p className="text-[11px] text-[#c5251c] mt-1">{errs.issued_at}</p>
          )}
        </div>
        <div>
          <Label htmlFor="due_date">Due date</Label>
          <Input
            id="due_date"
            name="due_date"
            type="date"
            defaultValue={invoice?.due_date ?? ""}
            invalid={Boolean(errs.due_date)}
          />
          {errs.due_date && (
            <p className="text-[11px] text-[#c5251c] mt-1">{errs.due_date}</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="client_id" optional>
            Client ID
          </Label>
          <Input
            id="client_id"
            name="client_id"
            defaultValue={invoice?.client_id ?? ""}
            placeholder="uuid (optional)"
          />
        </div>
        <div>
          <Label htmlFor="project_id" optional>
            Project ID
          </Label>
          <Input
            id="project_id"
            name="project_id"
            defaultValue={invoice?.project_id ?? ""}
            placeholder="uuid (optional)"
          />
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <Label htmlFor="lines">Line items</Label>
          <button
            type="button"
            onClick={addLine}
            className="text-[12px] font-medium text-[#0071e3] hover:underline"
          >
            + Add line
          </button>
        </div>
        <div className="space-y-2">
          {lines.map((line, i) => (
            <div key={i} className="grid grid-cols-12 gap-2 items-start">
              <input
                value={line.description}
                onChange={(e) => update(i, { description: e.target.value })}
                placeholder="Description"
                className="col-span-6 bg-white text-[#1d1d1f] placeholder:text-[#86868b] ring-1 ring-inset ring-[#e5e5ea] rounded-[10px] h-10 px-3 text-[13px] focus:outline-none focus:ring-2 focus:ring-[#0071e3]"
              />
              <input
                type="number"
                step="0.01"
                value={line.quantity}
                onChange={(e) => update(i, { quantity: e.target.value })}
                placeholder="Qty"
                className="col-span-2 bg-white text-[#1d1d1f] ring-1 ring-inset ring-[#e5e5ea] rounded-[10px] h-10 px-2 text-[13px] font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-[#0071e3] text-right"
              />
              <input
                type="number"
                step="0.01"
                value={line.unit_price}
                onChange={(e) => update(i, { unit_price: e.target.value })}
                placeholder="Unit"
                className="col-span-3 bg-white text-[#1d1d1f] ring-1 ring-inset ring-[#e5e5ea] rounded-[10px] h-10 px-2 text-[13px] font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-[#0071e3] text-right"
              />
              <button
                type="button"
                onClick={() => removeLine(i)}
                disabled={lines.length === 1}
                aria-label="Remove line"
                className="col-span-1 h-10 inline-flex items-center justify-center rounded-[8px] text-[#86868b] hover:bg-[#f5f5f7] disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>
        {errs.line_items && (
          <p className="text-[11px] text-[#c5251c] mt-1">{errs.line_items}</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 pt-2 border-t border-[#e5e5ea]">
        <div>
          <Label htmlFor="total">Total</Label>
          <Input
            id="total"
            name="total"
            type="number"
            step="0.01"
            min="0"
            defaultValue={String(invoice?.total ?? autoTotal.toFixed(2))}
            key={autoTotal}
            className="font-mono tabular-nums"
            invalid={Boolean(errs.total)}
          />
          {errs.total && <p className="text-[11px] text-[#c5251c] mt-1">{errs.total}</p>}
        </div>
        <div>
          <Label htmlFor="amount_paid">Amount paid</Label>
          <Input
            id="amount_paid"
            name="amount_paid"
            type="number"
            step="0.01"
            min="0"
            defaultValue={String(invoice?.amount_paid ?? 0)}
            className="font-mono tabular-nums"
            invalid={Boolean(errs.amount_paid)}
          />
          {errs.amount_paid && (
            <p className="text-[11px] text-[#c5251c] mt-1">{errs.amount_paid}</p>
          )}
        </div>
      </div>

      {state.error && !state.fieldErrors && (
        <div className="rounded-[10px] bg-[#ff3b30]/[0.06] ring-1 ring-[#ff3b30]/30 px-3 py-2 text-[12px] text-[#c5251c]">
          {state.error}
        </div>
      )}

      <div className="flex items-center justify-end gap-2 pt-1">
        {onCancel && (
          <Button type="button" variant="ghost" size="md" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit" variant="primary" size="md" disabled={pending}>
          {pending ? "Saving…" : isEdit ? "Save changes" : "Create invoice"}
        </Button>
      </div>
    </form>
  );
}

function deriveTotal(lines: LineRow[]): number {
  return lines.reduce((sum, l) => {
    const q = Number(l.quantity) || 0;
    const p = Number(l.unit_price) || 0;
    return sum + q * p;
  }, 0);
}
