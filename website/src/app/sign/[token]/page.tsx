/**
 * Public document signing page.
 *
 * Token in the URL is the only credential — no portal session is required, so
 * customers can sign without an account.
 */
import { redirect } from 'next/navigation';
import SignClient from './SignClient';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || '';

type SigningContext = {
  status: 'pending' | 'signed' | 'declined' | 'expired' | 'consumed' | 'invalid';
  signatureId?: string;
  documentType?: 'estimate' | 'invoice' | 'contract';
  documentTitle?: string | null;
  signerName?: string | null;
  signerEmail?: string | null;
  originalPdfUrl?: string | null;
};

async function loadContext(token: string): Promise<SigningContext> {
  try {
    const res = await fetch(`${BACKEND_URL}/api/esign/sign/${token}`, { cache: 'no-store' });
    if (res.status === 410) {
      const json = (await res.json()) as SigningContext;
      return { status: json.status || 'expired' };
    }
    if (!res.ok) return { status: 'invalid' };
    return (await res.json()) as SigningContext;
  } catch {
    return { status: 'invalid' };
  }
}

export default async function SignPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ctx = await loadContext(token);

  if (ctx.status === 'signed') redirect('/sign/signed');
  if (ctx.status === 'expired' || ctx.status === 'consumed' || ctx.status === 'declined' || ctx.status === 'invalid') {
    redirect('/sign/expired');
  }

  return (
    <main className="min-h-dvh bg-slate-50 py-10 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-6">
          <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Signature requested</p>
          <h1 className="mt-2 text-2xl font-bold text-slate-900">{ctx.documentTitle || 'Document'}</h1>
          {ctx.signerName && (
            <p className="mt-1 text-sm text-slate-600">For {ctx.signerName}</p>
          )}
        </div>

        {ctx.originalPdfUrl ? (
          <div className="rounded-2xl overflow-hidden border border-slate-200 shadow-sm bg-white mb-6">
            <iframe
              src={ctx.originalPdfUrl}
              title="Document preview"
              className="w-full h-[560px]"
            />
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-slate-500 mb-6">
            Document preview unavailable.
          </div>
        )}

        <SignClient
          token={token}
          documentTitle={ctx.documentTitle || ''}
          defaultSignerName={ctx.signerName || ''}
        />

        <p className="mt-8 text-center text-xs text-slate-500">
          Signed electronically with Sylk · Audit trail (IP, device, timestamp, document hash) is recorded with your signature.
        </p>
      </div>
    </main>
  );
}
