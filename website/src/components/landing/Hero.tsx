'use client';

import { motion } from 'framer-motion';
import Image from 'next/image';
import Button from '@/components/ui/Button';
import { StarIcon } from '@heroicons/react/24/solid';
import {
  SparklesIcon,
  ChatBubbleLeftRightIcon,
  DocumentTextIcon,
} from '@heroicons/react/24/outline';

function FloatingCard({
  children,
  className,
  delay,
}: {
  children: React.ReactNode;
  className: string;
  delay: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: 'spring', damping: 15, delay }}
      className={`absolute card-elevated px-4 py-3 ${className}`}
    >
      {children}
    </motion.div>
  );
}

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
          {/* Left: Text */}
          <div className="flex-1 text-center lg:text-left">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="inline-flex items-center gap-2 bg-blue-50 border border-blue-100 rounded-full px-4 py-1.5 mb-8"
            >
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
              </span>
              <span className="text-xs text-primary font-semibold">Now available on iOS & Android</span>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-extrabold tracking-tight mb-6 leading-[1.05] text-gray-900"
            >
              Run Your
              <br />
              Business{' '}
              <span className="gradient-text">Smarter</span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.4 }}
              className="max-w-lg text-base sm:text-lg text-text-secondary mb-8 leading-relaxed mx-auto lg:mx-0"
            >
              The AI-powered platform that helps service businesses create estimates,
              manage projects, and grow revenue — all from your phone.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.6 }}
              className="flex flex-col sm:flex-row items-center gap-4 mb-8 justify-center lg:justify-start"
            >
              <Button href="#pricing" className="text-base px-8 py-3.5">
                Start Free Trial
              </Button>
              <Button href="#features" variant="secondary" className="text-base">
                See How It Works
              </Button>
            </motion.div>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.8 }}
              className="flex items-center gap-3 justify-center lg:justify-start"
            >
              <div className="flex gap-0.5">
                {[1, 2, 3, 4, 5].map((i) => (
                  <StarIcon key={i} className="h-4 w-4 text-amber-400" />
                ))}
              </div>
              <span className="text-sm text-text-muted font-medium">4.9 Rating</span>
              <span className="h-3 w-px bg-border" />
              <span className="text-sm text-text-muted font-medium">500+ Businesses</span>
            </motion.div>
          </div>

          {/* Right: Phone mockup */}
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.4, type: 'spring', damping: 20 }}
            className="flex-1 relative flex justify-center"
          >
            <div className="relative">
              {/* Soft glow */}
              <div className="absolute inset-0 bg-gradient-to-b from-blue-100/50 to-cyan-100/30 blur-[60px] rounded-full scale-75" />

              {/* Phone body */}
              <div className="relative w-[280px] sm:w-[320px] bg-gray-900 rounded-[3rem] p-3 shadow-2xl shadow-gray-900/20">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-28 h-7 bg-black rounded-b-2xl z-10" />

                {/* Screen */}
                <div className="relative bg-surface rounded-[2.4rem] overflow-hidden aspect-[9/19.5]">
                  <div className="pt-12 px-5 bg-white h-full">
                    <div className="flex items-center gap-3 mb-6">
                      <Image src="/logo.png" alt="Sylk" width={36} height={36} className="rounded-xl" />
                      <div>
                        <p className="text-gray-900 text-sm font-bold">Sylk</p>
                        <p className="text-gray-400 text-[10px]">Dashboard</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 mb-4">
                      <div className="bg-surface rounded-xl p-3 border border-border">
                        <p className="text-[10px] text-text-muted">Revenue</p>
                        <p className="text-gray-900 text-sm font-bold">$24,500</p>
                        <p className="text-emerald-500 text-[9px] font-medium">+12% this month</p>
                      </div>
                      <div className="bg-surface rounded-xl p-3 border border-border">
                        <p className="text-[10px] text-text-muted">Active Jobs</p>
                        <p className="text-gray-900 text-sm font-bold">8</p>
                        <p className="text-primary text-[9px] font-medium">3 due this week</p>
                      </div>
                    </div>

                    <div className="space-y-2">
                      {[
                        { name: 'Kitchen Remodel', progress: 75, color: 'bg-primary' },
                        { name: 'Roof Repair', progress: 40, color: 'bg-cyan-accent' },
                        { name: 'HVAC Install', progress: 90, color: 'bg-emerald-500' },
                      ].map((project) => (
                        <div key={project.name} className="bg-surface rounded-xl p-3 border border-border">
                          <div className="flex justify-between items-center mb-2">
                            <p className="text-gray-900 text-xs font-medium">{project.name}</p>
                            <p className="text-text-muted text-[10px]">{project.progress}%</p>
                          </div>
                          <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${project.progress}%` }}
                              transition={{ duration: 1.2, delay: 1 + Math.random() * 0.5, ease: 'easeOut' }}
                              className={`h-full ${project.color} rounded-full`}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <FloatingCard className="hidden sm:flex -left-36 top-20 items-center gap-2" delay={1.2}>
                <SparklesIcon className="h-4 w-4 text-amber-500" />
                <span className="text-xs text-gray-700 font-medium">Estimate sent!</span>
              </FloatingCard>

              <FloatingCard className="hidden sm:flex -right-40 top-40 items-center gap-2" delay={1.5}>
                <ChatBubbleLeftRightIcon className="h-4 w-4 text-primary" />
                <span className="text-xs text-gray-700 font-medium">AI: &ldquo;$12,450 total&rdquo;</span>
              </FloatingCard>

              <FloatingCard className="hidden sm:flex -left-32 bottom-32 items-center gap-2" delay={1.8}>
                <DocumentTextIcon className="h-4 w-4 text-emerald-500" />
                <span className="text-xs text-gray-700 font-medium">Invoice paid</span>
              </FloatingCard>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
