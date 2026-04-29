export default function SignedPage() {
  return (
    <main className="min-h-dvh bg-slate-50 grid place-items-center px-6">
      <div className="max-w-md w-full rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto h-12 w-12 rounded-full bg-emerald-100 grid place-items-center text-emerald-600 text-2xl">✓</div>
        <h1 className="mt-4 text-xl font-bold text-slate-900">Document signed</h1>
        <p className="mt-2 text-sm text-slate-600">
          Thank you. The signed PDF and audit trail have been delivered to the contractor.
        </p>
      </div>
    </main>
  );
}
