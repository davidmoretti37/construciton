import Link from "next/link";
import Image from "next/image";

export const metadata = {
  title: "Terms of Service — Sylk",
  description: "Terms of Service for Sylk.",
};

export default function Terms() {
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
        <h1 className="text-3xl font-bold text-gray-900">Terms of Service</h1>
        <p className="text-sm text-gray-500">Last updated: April 28, 2026</p>

        <p>
          These Terms of Service (the &quot;Terms&quot;) govern your use of the
          Sylk application and related services (the &quot;Service&quot;). By
          creating an account or using the Service, you agree to these Terms.
        </p>

        <h2 className="mt-8 text-xl font-semibold text-gray-900">
          1. Eligibility &amp; account
        </h2>
        <p>
          You must be at least 18 years old and able to form a binding contract.
          You are responsible for maintaining the confidentiality of your
          credentials and for all activity under your account.
        </p>

        <h2 className="mt-8 text-xl font-semibold text-gray-900">
          2. Subscription &amp; payment
        </h2>
        <p>
          Paid plans are billed in advance on a recurring basis through our
          payment processor. You authorize us to charge your payment method for
          all subscription fees and applicable taxes. Fees are non-refundable
          except as required by law.
        </p>

        <h2 className="mt-8 text-xl font-semibold text-gray-900">
          3. Acceptable use
        </h2>
        <p>
          You agree not to: (a) misuse the Service or attempt to access it
          using methods other than the interfaces we provide; (b) upload
          content that infringes others&apos; rights or violates law; or (c)
          interfere with the security or integrity of the Service.
        </p>

        <h2 className="mt-8 text-xl font-semibold text-gray-900">
          4. Your content
        </h2>
        <p>
          You retain all rights to the data you upload (&quot;Customer
          Content&quot;). You grant us a limited license to host, transmit, and
          process Customer Content solely to provide the Service to you and
          your authorized users.
        </p>

        <h2 className="mt-8 text-xl font-semibold text-gray-900">
          5. Termination
        </h2>
        <p>
          You may cancel at any time from the Settings page. We may suspend or
          terminate your access if you breach these Terms or if required by
          law. Upon termination, your access ends immediately and your data
          will be deleted after a 30-day grace period.
        </p>

        <h2 className="mt-8 text-xl font-semibold text-gray-900">
          6. Disclaimer
        </h2>
        <p>
          The Service is provided &quot;as is&quot; without warranties of any
          kind. To the maximum extent permitted by law, we disclaim all implied
          warranties, including merchantability and fitness for a particular
          purpose.
        </p>

        <h2 className="mt-8 text-xl font-semibold text-gray-900">
          7. Limitation of liability
        </h2>
        <p>
          To the maximum extent permitted by law, our aggregate liability under
          these Terms will not exceed the amount you paid us in the 12 months
          preceding the claim.
        </p>

        <h2 className="mt-8 text-xl font-semibold text-gray-900">
          8. Changes
        </h2>
        <p>
          We may update these Terms from time to time. Material changes will be
          announced in-app or by email. Continued use after changes take effect
          constitutes acceptance.
        </p>

        <h2 className="mt-8 text-xl font-semibold text-gray-900">
          9. Contact
        </h2>
        <p>
          Questions? Email{" "}
          <a
            href="mailto:support@sylkapp.ai"
            className="text-blue-600 hover:underline"
          >
            support@sylkapp.ai
          </a>
          .
        </p>
      </main>
    </div>
  );
}
