"use client";

import { useState } from "react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Label from "@/components/ui/Label";
import { useToast } from "@/components/ui/toast-provider";

export type SendMode = "send" | "esign";
export type SendDocumentType = "invoice" | "estimate" | "contract";

interface Props {
  documentId: string;
  documentNumber?: string;
  type: SendDocumentType;
  mode?: SendMode;
  defaultEmail?: string;
  defaultName?: string;
  onSuccess?: (data: { token?: string; signUrl?: string }) => void;
  onClose?: () => void;
}

export default function SendDocumentModal({
  documentId,
  documentNumber,
  type,
  mode = "send",
  defaultEmail = "",
  defaultName = "",
  onSuccess,
  onClose,
}: Props) {
  const { toast } = useToast();
  const [email, setEmail] = useState(defaultEmail);
  const [name, setName] = useState(defaultName);
  const [subject, setSubject] = useState(
    `${documentNumber ?? type.charAt(0).toUpperCase() + type.slice(1)} ${
      mode === "esign" ? "ready for signature" : "ready"
    }`,
  );
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signLink, setSignLink] = useState<string | null>(null);

  function emailValid(value: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!emailValid(email)) {
      setError("Enter a valid email");
      return;
    }
    if (mode === "esign" && !name.trim()) {
      setError("Signer name is required");
      return;
    }

    setSubmitting(true);
    try {
      if (mode === "esign") {
        const res = await fetch("/api/esign/request", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            documentType: type,
            documentId,
            signerName: name,
            signerEmail: email,
          }),
        });
        if (!res.ok) {
          const body = await res.text().catch(() => "");
          throw new Error(body || "Request failed");
        }
        const data = (await res.json().catch(() => ({}))) as {
          token?: string;
          signUrl?: string;
        };
        const link =
          data.signUrl ??
          (data.token ? `${window.location.origin}/sign/${data.token}` : null);
        setSignLink(link);
        toast({
          title: "Signature requested",
          description: link ?? "Email sent to signer.",
          variant: "success",
        });
        onSuccess?.({ token: data.token, signUrl: link ?? undefined });
      } else {
        const res = await fetch(
          `/api/portal-admin/${type}s/${documentId}/send`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, subject, message }),
          },
        );
        if (!res.ok) {
          const body = await res.text().catch(() => "");
          throw new Error(body || "Send failed");
        }
        toast({
          title: `${type.charAt(0).toUpperCase() + type.slice(1)} sent`,
          description: `Delivered to ${email}.`,
          variant: "success",
        });
        onSuccess?.({});
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong";
      setError(msg);
      toast({ title: "Send failed", description: msg, variant: "error" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {mode === "esign" && (
        <div>
          <Label htmlFor="send-name">Signer name</Label>
          <Input
            id="send-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Pat Doe"
            required
          />
        </div>
      )}

      <div>
        <Label htmlFor="send-email">
          {mode === "esign" ? "Signer email" : "Recipient email"}
        </Label>
        <Input
          id="send-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="client@example.com"
          required
          invalid={Boolean(error && !emailValid(email))}
        />
      </div>

      {mode === "send" && (
        <div>
          <Label htmlFor="send-subject">Subject</Label>
          <Input
            id="send-subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          />
        </div>
      )}

      <div>
        <Label htmlFor="send-message" optional>
          Message
        </Label>
        <textarea
          id="send-message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={4}
          maxLength={5000}
          placeholder={
            mode === "esign"
              ? "Add a note for the signer (optional)…"
              : "Add a personal note (optional)…"
          }
          className="w-full bg-white text-[#1d1d1f] placeholder:text-[#86868b] ring-1 ring-inset ring-[#e5e5ea] rounded-[10px] p-3 text-[14px] focus:outline-none focus:ring-2 focus:ring-[#0071e3] transition-shadow resize-y"
        />
      </div>

      {error && (
        <div className="rounded-[10px] bg-[#ff3b30]/[0.06] ring-1 ring-[#ff3b30]/30 px-3 py-2 text-[12px] text-[#c5251c]">
          {error}
        </div>
      )}

      {signLink && (
        <div className="rounded-[10px] bg-[#0071e3]/[0.06] ring-1 ring-[#0071e3]/20 px-3 py-2.5 text-[12px] text-[#1d1d1f] space-y-2">
          <p className="font-medium">Signature link</p>
          <code className="block bg-white ring-1 ring-[#e5e5ea] rounded px-2 py-1.5 text-[11px] font-mono text-[#1d1d1f] break-all">
            {signLink}
          </code>
          <button
            type="button"
            onClick={() => {
              navigator.clipboard?.writeText(signLink);
              toast({ title: "Copied", variant: "success", durationMs: 1500 });
            }}
            className="text-[12px] font-medium text-[#0071e3] hover:underline"
          >
            Copy link
          </button>
        </div>
      )}

      <div className="flex items-center justify-end gap-2 pt-2">
        {onClose && (
          <Button type="button" variant="ghost" size="md" onClick={onClose}>
            Cancel
          </Button>
        )}
        <Button type="submit" variant="primary" size="md" disabled={submitting}>
          {submitting
            ? "Sending…"
            : mode === "esign"
              ? "Request signature"
              : `Send ${type}`}
        </Button>
      </div>
    </form>
  );
}
