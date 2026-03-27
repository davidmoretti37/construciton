import Navbar from '@/components/landing/Navbar';
import Hero from '@/components/landing/Hero';
import SocialProof from '@/components/landing/SocialProof';
import Industries from '@/components/landing/Industries';
import HowItWorks from '@/components/landing/HowItWorks';
import AppShowcase from '@/components/landing/AppShowcase';
import TeamRoles from '@/components/landing/TeamRoles';
import Testimonials from '@/components/landing/Testimonials';
import Pricing from '@/components/landing/Pricing';
import CTA from '@/components/landing/CTA';
import Footer from '@/components/landing/Footer';

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Sylk",
  applicationCategory: "BusinessApplication",
  operatingSystem: "iOS, Android",
  description:
    "AI-powered platform that helps service businesses create estimates, manage projects, track finances, and grow revenue.",
  url: "https://sylkapp.ai",
  offers: {
    "@type": "AggregateOffer",
    lowPrice: "49",
    highPrice: "149",
    priceCurrency: "USD",
    offerCount: 3,
  },
  aggregateRating: {
    "@type": "AggregateRating",
    ratingValue: "4.9",
    ratingCount: "500",
  },
};

export default function Home() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
        }}
      />
      <Navbar />
      <main>
        <Hero />
        <SocialProof />
        <Industries />
        <HowItWorks />
        <AppShowcase />
        <TeamRoles />
        <Testimonials />
        <Pricing />
        <CTA />
      </main>
      <Footer />
    </>
  );
}
