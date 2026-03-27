import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <h1 className="text-6xl font-bold text-primary">404</h1>
      <p className="mt-4 text-xl text-gray-600">Page not found</p>
      <Link
        href="/"
        className="mt-8 rounded-xl bg-primary px-6 py-3 text-white font-semibold hover:opacity-90 transition-opacity"
      >
        Back to Home
      </Link>
    </div>
  );
}
