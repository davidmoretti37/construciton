'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import SignatureCanvas from 'react-signature-canvas';

// Same-origin proxy. Avoids CORS / env-var-in-browser-bundle issues when the
// page loads inside the mobile WebView. The proxy at /api/esign/sign/<token>
// forwards server-side to the real backend.

export default function SignClient({
  token,
  documentTitle,
  defaultSignerName,
}: {
  token: string;
  documentTitle: string;
  defaultSignerName: string;
}) {
  const router = useRouter();
  const sigRef = useRef<SignatureCanvas | null>(null);
  const [signerName, setSignerName] = useState(defaultSignerName);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClear = () => sigRef.current?.clear();

  const handleSubmit = async () => {
    setError(null);
    if (!signerName.trim()) {
      setError('Please type your name.');
      return;
    }
    if (sigRef.current?.isEmpty()) {
      setError('Please sign in the box.');
      return;
    }
    setSubmitting(true);
    try {
      const dataUrl = sigRef.current!.getCanvas().toDataURL('image/png');
      const res = await fetch(`/api/esign/sign/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signaturePngBase64: dataUrl.replace(/^data:image\/[a-z]+;base64,/, ''),
          signerName: signerName.trim(),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      router.push('/sign/signed');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to record signature');
      setSubmitting(false);
    }
  };

  const handleDecline = async () => {
    if (!confirm('Decline to sign this document?')) return;
    try {
      await fetch(`/api/esign/decline/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
    } catch { /* swallow */ }
    router.push('/sign/expired');
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-6">
      <label className="block">
        <span className="text-sm font-semibold text-slate-700">Your full name</span>
        <input
          value={signerName}
          onChange={(e) => setSignerName(e.target.value)}
          placeholder="Full name"
          className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </label>

      <div className="mt-5">
        <span className="text-sm font-semibold text-slate-700">Sign below</span>
        <div className="mt-2 rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 overflow-hidden">
          <SignatureCanvas
            ref={(r) => { sigRef.current = r; }}
            canvasProps={{ className: 'w-full h-48 bg-white' }}
            backgroundColor="#FFFFFF"
            penColor="#0F172A"
          />
        </div>
        <button
          onClick={handleClear}
          type="button"
          className="mt-2 text-xs text-slate-500 hover:text-slate-700"
        >
          Clear
        </button>
      </div>

      {error && (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="mt-6 flex flex-col sm:flex-row gap-3">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting}
          className="flex-1 rounded-lg bg-blue-700 px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-blue-800 disabled:opacity-60"
        >
          {submitting ? 'Submitting…' : `Confirm and sign${documentTitle ? `: ${documentTitle}` : ''}`}
        </button>
        <button
          type="button"
          onClick={handleDecline}
          disabled={submitting}
          className="rounded-lg border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
        >
          Decline
        </button>
      </div>
    </div>
  );
}
