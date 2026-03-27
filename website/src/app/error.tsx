"use client";

export default function Error({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <h1 className="text-4xl font-bold text-gray-900">Something went wrong</h1>
      <p className="mt-4 text-lg text-gray-600">
        {error.message || "An unexpected error occurred."}
      </p>
      <button
        onClick={() => unstable_retry()}
        className="mt-8 rounded-xl bg-primary px-6 py-3 text-white font-semibold hover:opacity-90 transition-opacity"
      >
        Try Again
      </button>
    </div>
  );
}
