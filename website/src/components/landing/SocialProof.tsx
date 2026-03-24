'use client';

import { useRef, useEffect, useState } from 'react';
import { motion, useInView } from 'framer-motion';
import { STATS } from '@/lib/constants';

function AnimatedCounter({
  value,
  prefix = '',
  suffix = '',
  decimals = 0,
  shouldAnimate,
}: {
  value: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  shouldAnimate: boolean;
}) {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (!shouldAnimate) return;
    const end = value;
    const duration = 1500;
    const startTime = Date.now();

    const tick = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(end * eased);
      if (progress < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [shouldAnimate, value]);

  return (
    <span className="text-2xl sm:text-3xl font-extrabold text-gray-900">
      {prefix}
      {decimals > 0 ? display.toFixed(decimals) : Math.round(display)}
      {suffix}
    </span>
  );
}

export default function SocialProof() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-40px' });

  return (
    <div ref={ref} className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 -mt-8 relative z-10">
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={isInView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.6 }}
        className="card-elevated p-6 sm:p-8"
      >
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 sm:gap-8">
          {STATS.map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={isInView ? { opacity: 1, scale: 1 } : {}}
              transition={{ duration: 0.4, delay: i * 0.1 }}
              className="text-center"
            >
              <AnimatedCounter
                value={stat.value}
                prefix={'prefix' in stat ? (stat as { prefix: string }).prefix : ''}
                suffix={stat.suffix}
                decimals={'decimals' in stat ? (stat as { decimals: number }).decimals : 0}
                shouldAnimate={isInView}
              />
              <p className="text-xs sm:text-sm text-text-muted mt-1">{stat.label}</p>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
