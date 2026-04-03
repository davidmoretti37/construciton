'use client';

import dynamic from 'next/dynamic';
import Button from '@/components/ui/Button';
import { StarIcon } from '@heroicons/react/24/solid';

const PhoneMockup3D = dynamic(() => import('./PhoneMockup3D'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-[600px] sm:h-[700px] flex items-center justify-center">
      <div className="w-[280px] sm:w-[320px] h-[560px] bg-gray-100 rounded-[3rem] animate-pulse" />
    </div>
  ),
});

export default function Hero() {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden pt-16 bg-white">
      {/* Subtle background gradient */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1200px] h-[800px] rounded-full bg-blue-50/80 blur-[100px]" />
        <div className="absolute top-1/3 right-0 w-[400px] h-[400px] rounded-full bg-cyan-50/60 blur-[80px]" />
      </div>

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col lg:flex-row items-center gap-12 lg:gap-20">
          {/* Left: Text — CSS animations so content is visible before JS loads */}
          <div className="flex-1 text-center lg:text-left">
            <div className="animate-fade-in-up inline-flex items-center gap-2 bg-blue-50 border border-blue-100 rounded-full px-4 py-1.5 mb-8">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
              </span>
              <span className="text-xs text-primary font-semibold">Now available on iOS & Android</span>
            </div>

            <h1 className="animate-fade-in-up [animation-delay:100ms] text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-extrabold tracking-tight mb-6 leading-[1.05] text-gray-900">
              Run Your
              <br />
              Business{' '}
              <span className="gradient-text">Smarter</span>
            </h1>

            <p className="animate-fade-in-up [animation-delay:200ms] max-w-lg text-base sm:text-lg text-text-secondary mb-8 leading-relaxed mx-auto lg:mx-0">
              The AI-powered platform for service businesses — projects, crews, estimates,
              invoices, bank reconciliation, and a 60-tool AI agent that runs your operations.
              Built for construction, cleaning, pest control, landscaping, and every trade in between.
            </p>

            <div className="animate-fade-in-up [animation-delay:300ms] flex flex-col sm:flex-row items-center gap-4 mb-8 justify-center lg:justify-start">
              <Button href="#pricing" className="text-base px-8 py-3.5">
                Start Free Trial
              </Button>
              <Button href="#features" variant="secondary" className="text-base">
                See How It Works
              </Button>
            </div>

            <div className="animate-fade-in-up [animation-delay:400ms] flex items-center gap-3 justify-center lg:justify-start">
              <div className="flex gap-0.5">
                {[1, 2, 3, 4, 5].map((i) => (
                  <StarIcon key={i} className="h-4 w-4 text-amber-400" />
                ))}
              </div>
              <span className="text-sm text-text-muted font-medium">4.9 Rating</span>
              <span className="h-3 w-px bg-border" />
              <span className="text-sm text-text-muted font-medium">500+ Businesses</span>
            </div>
          </div>

          {/* Right: 3D Phone mockup */}
          <div className="flex-1 relative">
            <PhoneMockup3D />
          </div>
        </div>
      </div>
    </section>
  );
}
