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

export default function Home() {
  return (
    <>
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
