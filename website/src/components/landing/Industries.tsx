'use client';

import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import { INDUSTRIES } from '@/lib/constants';

export default function Industries() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-40px' });

  return (
    <div ref={ref} className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-16">
      <motion.p
        initial={{ opacity: 0 }}
        animate={isInView ? { opacity: 1 } : {}}
        className="text-center text-text-muted text-sm font-medium mb-6"
      >
        Built for every service business
      </motion.p>
      <div className="flex flex-wrap justify-center gap-2.5">
        {INDUSTRIES.map((industry, i) => (
          <motion.span
            key={industry}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={isInView ? { opacity: 1, scale: 1 } : {}}
            transition={{ duration: 0.3, delay: i * 0.04 }}
            className="px-4 py-2 rounded-full bg-surface-2 border border-border text-sm text-gray-700 font-medium hover:bg-blue-50 hover:border-blue-200 hover:text-primary transition-colors cursor-default"
          >
            {industry}
          </motion.span>
        ))}
      </div>
    </div>
  );
}
