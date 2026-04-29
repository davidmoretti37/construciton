"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Label from "@/components/ui/Label";
import FileUpload from "@/components/ui/FileUpload";
import { useToast } from "@/components/ui/toast-provider";
import {
  createContract,
  updateContract,
  type ContractFormState,
} from "@/app/actions/contracts";
import type { DbContract, DbContractTemplate } from "@/types/database";

interface Props {
  contract?: DbContract | null;
  templates?: DbContractTemplate[];
  onSuccess?: (contractId: string) => void;
}

const initial: ContractFormState = { ok: false };

export default function ContractEditor({ contract, templates = [], onSuccess }: Props) {
  const isEdit = Boolean(contract?.id);
  const router = useRouter();
  const { toast } = useToast();

  const action = isEdit ? updateContract.bind(null, contract!.id) : createContract;
  const [state, formAction, pending] = useActionState(action, initial);

  const [title, setTitle] = useState(contract?.title ?? "");
  const [body, setBody] = useState(contract?.body ?? "");
  const [templateId, setTemplateId] = useState(contract?.template_id ?? "");

  function applyTemplate(id: string) {
    setTemplateId(id);
    const tpl = templates.find((t) => t.id === id);
    if (tpl?.body_markdown && !body) setBody(tpl.body_markdown);
  }

  useEffect(() => {
    if (state.ok && state.contractId) {
      toast({
        title: isEdit ? "Contract updated" : "Contract created",
        variant: "success",
      });
      onSuccess?.(state.contractId);
      router.refresh();
    } else if (state.error) {
      toast({ title: state.error, variant: "error" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const errs = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="space-y-5">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="contract-title">Title</Label>
          <Input
            id="contract-title"
            name="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Master service agreement"
            required
            invalid={Boolean(errs.title)}
          />
          {errs.title && (
            <p className="text-[11px] text-[#c5251c] mt-1">{errs.title}</p>
          )}
        </div>
        <div>
          <Label htmlFor="contract-status">Status</Label>
          <select
            id="contract-status"
            name="status"
            defaultValue={contract?.status ?? "draft"}
            className="w-full bg-white text-[#1d1d1f] ring-1 ring-inset ring-[#e5e5ea] rounded-[10px] h-10 px-3 text-[14px] focus:outline-none focus:ring-2 focus:ring-[#0071e3]"
          >
            {["draft", "sent", "viewed", "signed", "declined", "expired", "void"].map(
              (s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ),
            )}
          </select>
        </div>
      </div>

      {templates.length > 0 && (
        <div>
          <Label htmlFor="template-picker" optional>
            Template
          </Label>
          <select
            id="template-picker"
            name="template_id"
            value={templateId}
            onChange={(e) => applyTemplate(e.target.value)}
            className="w-full bg-white text-[#1d1d1f] ring-1 ring-inset ring-[#e5e5ea] rounded-[10px] h-10 px-3 text-[14px] focus:outline-none focus:ring-2 focus:ring-[#0071e3]"
          >
            <option value="">No template</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="contract-client_id" optional>
            Client ID
          </Label>
          <Input
            id="contract-client_id"
            name="client_id"
            defaultValue={contract?.client_id ?? ""}
            placeholder="uuid (optional)"
          />
        </div>
        <div>
          <Label htmlFor="contract-project_id" optional>
            Project ID
          </Label>
          <Input
            id="contract-project_id"
            name="project_id"
            defaultValue={contract?.project_id ?? ""}
            placeholder="uuid (optional)"
          />
        </div>
      </div>

      <div>
        <Label htmlFor="contract-body" optional>
          Body
        </Label>
        <textarea
          id="contract-body"
          name="body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={16}
          className="w-full bg-white text-[#1d1d1f] placeholder:text-[#86868b] ring-1 ring-inset ring-[#e5e5ea] rounded-[10px] p-4 text-[13px] font-mono leading-relaxed focus:outline-none focus:ring-2 focus:ring-[#0071e3] transition-shadow resize-y"
          placeholder="Contract body (markdown supported)…"
        />
        {errs.body && (
          <p className="text-[11px] text-[#c5251c] mt-1">{errs.body}</p>
        )}
      </div>

      {isEdit && (
        <div>
          <Label htmlFor="contract-files" optional>
            Attachments
          </Label>
          <FileUpload accept=".pdf,.docx" multiple />
        </div>
      )}

      {state.error && !state.fieldErrors && (
        <div className="rounded-[10px] bg-[#ff3b30]/[0.06] ring-1 ring-[#ff3b30]/30 px-3 py-2 text-[12px] text-[#c5251c]">
          {state.error}
        </div>
      )}

      <div className="flex items-center justify-end gap-2 pt-1">
        <Button type="submit" variant="primary" size="md" disabled={pending}>
          {pending ? "Saving…" : isEdit ? "Save changes" : "Create contract"}
        </Button>
      </div>
    </form>
  );
}
