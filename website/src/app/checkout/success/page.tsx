import Link from "next/link";

export default async function CheckoutSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  const { session_id } = await searchParams;

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-green-100">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            className="h-7 w-7 text-green-600"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-gray-900">Payment successful</h1>
        <p className="mt-2 text-sm text-gray-500">
          Thanks — your payment has been received.
          {session_id ? (
            <>
              <br />
              <span className="font-mono text-xs text-gray-400">{session_id}</span>
            </>
          ) : null}
        </p>
        <Link
          href="/"
          className="mt-6 inline-block rounded-xl bg-[#1E40AF] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#1E3A8A]"
        >
          Return home
        </Link>
      </div>
    </div>
  );
}
