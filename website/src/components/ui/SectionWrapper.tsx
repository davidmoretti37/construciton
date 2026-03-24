'use client';

import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';

export default function SectionWrapper({
  children,
  id,
  className = '',
}: {
  children: React.ReactNode;
  id?: string;
  className?: string;
}) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-80px' });

  return (
    <motion.section
      ref={ref}
      id={id}
      initial={{ opacity: 0, y: 40 }}
      animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 40 }}
      transition={{ duration: 0.6, ease: 'easeOut' }}
      className={`mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-20 sm:py-24 ${className}`}
    >
      {children}
    </motion.section>
  );
}
