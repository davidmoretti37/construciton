'use client';

import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import { StarIcon } from '@heroicons/react/24/solid';
import { TESTIMONIALS } from '@/lib/constants';
import SectionWrapper from '@/components/ui/SectionWrapper';

export default function Testimonials() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-60px' });

  return (
    <SectionWrapper id="testimonials" className="bg-surface">
      <div className="text-center mb-16">
        <motion.p
          initial={{ opacity: 0 }}
          animate={isInView ? { opacity: 1 } : {}}
          className="text-primary text-sm font-semibold tracking-wider uppercase mb-3"
        >
          Testimonials
        </motion.p>
        <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-gray-900 mb-5">
          Trusted by Service
          <br />
          <span className="gradient-text">Professionals</span>
        </h2>
        <p className="text-text-secondary text-lg">See what others are saying</p>
      </div>

      <div ref={ref} className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {TESTIMONIALS.map((t, i) => (
          <motion.div
            key={t.author}
            initial={{ opacity: 0, y: 30 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.5, delay: i * 0.15 }}
            className="card-elevated p-6 sm:p-8 flex flex-col hover:shadow-lg transition-shadow duration-300"
          >
            <div className="flex gap-1 mb-5">
              {Array.from({ length: t.rating }).map((_, j) => (
                <StarIcon key={j} className="h-4 w-4 text-amber-400" />
              ))}
            </div>

            <p className="text-gray-700 text-sm leading-relaxed flex-1 mb-6">
              &ldquo;{t.quote}&rdquo;
            </p>

            <div className="flex items-center gap-3 pt-4 border-t border-border">
              <div className="w-10 h-10 rounded-full bg-gradient-to-b from-blue-500 to-blue-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
                {t.author.split(' ').map(n => n[0]).join('')}
              </div>
              <div>
                <p className="text-gray-900 font-semibold text-sm">{t.author}</p>
                <p className="text-text-muted text-xs">{t.role}</p>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </SectionWrapper>
  );
}
