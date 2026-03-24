'use client';

import { motion, useInView } from 'framer-motion';
import { useRef } from 'react';
import Button from '@/components/ui/Button';
import { ArrowRightIcon } from '@heroicons/react/24/outline';

export default function CTA() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-60px' });

  return (
    <section ref={ref} className="relative py-24 sm:py-32 overflow-hidden bg-surface">
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={isInView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.6 }}
        className="relative mx-auto max-w-4xl px-4"
      >
        <div className="relative bg-gradient-to-br from-primary to-blue-700 rounded-3xl p-10 sm:p-16 text-center overflow-hidden">
          {/* Decorative circles */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2" />
          <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2" />

          <div className="relative">
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-white mb-6 leading-tight">
              Ready to Run Your
              <br />
              Business Smarter?
            </h2>
            <p className="text-blue-100 text-lg mb-10 max-w-xl mx-auto">
              Join 500+ service professionals. Start your free trial today — no credit card required.
            </p>
            <Button
              href="#pricing"
              className="text-base px-8 py-4 !bg-white !text-primary hover:!bg-blue-50 hover:!shadow-xl group"
            >
              Start Free Trial
              <ArrowRightIcon className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
            </Button>
          </div>
        </div>
      </motion.div>
    </section>
  );
}
