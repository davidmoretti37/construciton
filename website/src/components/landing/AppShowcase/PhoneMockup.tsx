'use client';

import { motion } from 'framer-motion';

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
      className="relative w-full max-w-[260px] sm:max-w-[280px]"
    >
      {/* Glow */}
      <div className="absolute inset-0 bg-blue-100/50 blur-[60px] rounded-full scale-75" />

      {/* Phone body */}
      <div className="relative bg-gray-900 rounded-[2.8rem] p-3 shadow-2xl shadow-gray-900/20">
        {/* Notch */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-24 h-6 bg-black rounded-b-2xl z-10" />

        {/* Screen */}
        <div className="relative bg-white rounded-[2.2rem] overflow-hidden aspect-[9/19.5]">
          <div className="pt-10 px-4 h-full overflow-hidden">
            {children}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
