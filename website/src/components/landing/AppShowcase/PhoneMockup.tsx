'use client';

import dynamic from 'next/dynamic';
import { motion } from 'framer-motion';

const PhoneMockup3DInner = dynamic(() => import('./PhoneMockup3DInner'), {
  ssr: false,
  loading: () => (
    <div className="relative w-full max-w-[260px] sm:max-w-[280px]">
      <div className="bg-gray-100 rounded-[2.8rem] aspect-[9/19.5] animate-pulse" />
    </div>
  ),
});

export default function PhoneMockup({
  children,
  isActive,
  delay = 200,
}: {
  children: React.ReactNode;
  isActive: boolean;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 60 }}
      animate={isActive ? { opacity: 1, y: 0 } : { opacity: 0, y: 60 }}
      transition={{ type: 'spring', damping: 20, stiffness: 80, delay: delay / 1000 }}
      className="relative w-full max-w-[420px]"
    >
      <PhoneMockup3DInner>{children}</PhoneMockup3DInner>
    </motion.div>
  );
}
