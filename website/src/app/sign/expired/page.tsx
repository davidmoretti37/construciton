export default function ExpiredPage() {
  return (
    <main className="min-h-dvh bg-slate-50 grid place-items-center px-6">
      <div className="max-w-md w-full rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto h-12 w-12 rounded-full bg-slate-100 grid place-items-center text-slate-500 text-2xl">!</div>
        <h1 className="mt-4 text-xl font-bold text-slate-900">Link unavailable</h1>
        <p className="mt-2 text-sm text-slate-600">
          This signing link is no longer valid. It may have already been used, declined, or expired.
        </p>
        <p className="mt-2 text-sm text-slate-600">
          Please reach out to the contractor for a new link.
        </p>
      </div>
    </main>
  );
}
