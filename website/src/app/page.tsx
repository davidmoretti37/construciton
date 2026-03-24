import Navbar from '@/components/landing/Navbar';
import Hero from '@/components/landing/Hero';
import SocialProof from '@/components/landing/SocialProof';
import Industries from '@/components/landing/Industries';
import HowItWorks from '@/components/landing/HowItWorks';
import Pillars from '@/components/landing/Pillars';
import AIDemo from '@/components/landing/AIDemo';
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
        <Pillars />
        <AIDemo />
        <TeamRoles />
        <Testimonials />
        <Pricing />
        <CTA />
      </main>
      <Footer />
    </>
  );
}
