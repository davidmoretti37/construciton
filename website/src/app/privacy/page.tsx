import Link from "next/link";
import Image from "next/image";

export const metadata = {
  title: "Privacy Policy — Sylk",
  description: "Privacy Policy for Sylk.",
};

export default function Privacy() {
  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-gray-200">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <Image
              src="/logo.png"
              alt="Sylk"
              width={32}
              height={32}
              className="rounded-lg"
            />
            <span className="text-gray-900 font-bold">Sylk</span>
          </Link>
          <Link
            href="/"
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            ← Back to home
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 sm:px-6 py-10 prose prose-gray prose-sm">
        <h1 className="text-3xl font-bold text-gray-900">Privacy Policy</h1>
        <p className="text-sm text-gray-500">Last updated: April 28, 2026</p>

        <p>
          This Privacy Policy describes how Sylk (&quot;we&quot;) collects,
          uses, and shares information when you use our application and
          services (the &quot;Service&quot;).
        </p>

        <h2 className="mt-8 text-xl font-semibold text-gray-900">
          Information we collect
        </h2>
        <ul>
          <li>
            <strong>Account information.</strong> Name, email address, business
            name, and authentication credentials.
          </li>
          <li>
            <strong>Customer content.</strong> Projects, clients, invoices,
            documents, and other data you upload to the Service.
          </li>
          <li>
            <strong>Usage data.</strong> Log information such as IP address,
            device type, pages visited, and timestamps.
          </li>
          <li>
            <strong>Payment information.</strong> Processed by our payment
            provider (Stripe). We do not store full card numbers on our
            servers.
          </li>
        </ul>

        <h2 className="mt-8 text-xl font-semibold text-gray-900">
          How we use information
        </h2>
        <ul>
          <li>To provide, maintain, and improve the Service.</li>
          <li>
            To process payments, send transactional notifications, and respond
            to support requests.
          </li>
          <li>To detect fraud and enforce our Terms of Service.</li>
          <li>
            With your permission, to send product updates and marketing
            communications. You can unsubscribe at any time.
          </li>
        </ul>

        <h2 className="mt-8 text-xl font-semibold text-gray-900">Sharing</h2>
        <p>
          We do not sell your personal information. We share data with
          subprocessors strictly as needed to operate the Service: hosting
          (Supabase), payments (Stripe), email delivery, and analytics. Each
          subprocessor is bound by confidentiality and data-protection
          obligations.
        </p>

        <h2 className="mt-8 text-xl font-semibold text-gray-900">
          Data retention
        </h2>
        <p>
          We retain Customer Content for as long as your account is active.
          When you cancel, we delete or anonymize your data within 30 days
          unless we are required to retain it for legal or compliance reasons.
        </p>

        <h2 className="mt-8 text-xl font-semibold text-gray-900">
          Your rights
        </h2>
        <p>
          Depending on your location, you may have rights to access, correct,
          export, or delete your personal information. Email{" "}
          <a
            href="mailto:privacy@sylkapp.ai"
            className="text-blue-600 hover:underline"
          >
            privacy@sylkapp.ai
          </a>{" "}
          to make a request.
        </p>

        <h2 className="mt-8 text-xl font-semibold text-gray-900">Security</h2>
        <p>
          We use industry-standard practices including encryption in transit
          (TLS), encryption at rest, and least-privilege access controls. No
          system is perfectly secure; if we discover a breach affecting your
          information, we will notify you as required by law.
        </p>

        <h2 className="mt-8 text-xl font-semibold text-gray-900">
          Children&apos;s privacy
        </h2>
        <p>
          The Service is not directed to children under 13, and we do not
          knowingly collect personal information from them.
        </p>

        <h2 className="mt-8 text-xl font-semibold text-gray-900">Changes</h2>
        <p>
          We may update this Privacy Policy from time to time. Material changes
          will be announced in-app or by email.
        </p>

        <h2 className="mt-8 text-xl font-semibold text-gray-900">Contact</h2>
        <p>
          Email{" "}
          <a
            href="mailto:privacy@sylkapp.ai"
            className="text-blue-600 hover:underline"
          >
            privacy@sylkapp.ai
          </a>{" "}
          with any questions.
        </p>
      </main>
    </div>
  );
}
