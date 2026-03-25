'use client';

import { motion } from 'framer-motion';
import { CheckCircleIcon } from '@heroicons/react/24/solid';
import { CameraIcon, CurrencyDollarIcon, PaperAirplaneIcon } from '@heroicons/react/24/outline';
import PhoneMockup from './PhoneMockup';
import TypewriterText from './TypewriterText';
import CountUpNumber from './CountUpNumber';

const lineItems = [
  { item: 'Kitchen Cabinets', price: '$4,200' },
  { item: 'Countertops', price: '$2,800' },
  { item: 'Flooring', price: '$1,500' },
  { item: 'Labor', price: '$3,200' },
  { item: 'Permits', price: '$800' },
];

const bullets = [
  { icon: CameraIcon, title: 'Snap a photo of any job', desc: 'AI calculates automatically' },
  { icon: CurrencyDollarIcon, title: 'Accurate pricing', desc: 'Based on your past projects' },
  { icon: PaperAirplaneIcon, title: 'Send professional PDFs', desc: 'Win more jobs with polished estimates' },
];

export default function SceneEstimates({ isActive }: { isActive: boolean }) {
  return (
    <div className="flex flex-col lg:flex-row items-center gap-6 lg:gap-16 w-full max-w-6xl mx-auto px-6">
      {/* Left: Text */}
      <div className="flex-1 text-center lg:text-left">
        <motion.p
          initial={{ opacity: 0 }}
          animate={isActive ? { opacity: 1 } : { opacity: 0 }}
          transition={{ duration: 0.4 }}
          className="text-blue-600 text-sm font-semibold tracking-wider uppercase mb-3"
        >
          AI Estimates
        </motion.p>
        <motion.h3
          initial={{ opacity: 0, y: 20 }}
          animate={isActive ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
          transition={{ type: 'spring', damping: 15, stiffness: 100 }}
          className="text-2xl sm:text-3xl lg:text-5xl font-extrabold text-gray-900 mb-5 leading-tight"
        >
          Create Estimates in{' '}
          <span className="bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
            60 Seconds
          </span>
        </motion.h3>
        <motion.p
          initial={{ opacity: 0, y: 15 }}
          animate={isActive ? { opacity: 1, y: 0 } : { opacity: 0, y: 15 }}
          transition={{ duration: 0.5, delay: 0.15 }}
          className="text-text-secondary text-base leading-relaxed mb-8 max-w-md mx-auto lg:mx-0"
        >
          Describe the job by voice or text. Your AI generates a detailed, itemized estimate with your pricing built in.
        </motion.p>

        <div className="space-y-4">
          {bullets.map((b, i) => (
            <motion.div
              key={b.title}
              initial={{ opacity: 0, x: -20 }}
              animate={isActive ? { opacity: 1, x: 0 } : { opacity: 0, x: -20 }}
              transition={{ duration: 0.4, delay: 2.2 + i * 0.15 }}
              className="flex items-start gap-3 text-left"
            >
              <div className="w-9 h-9 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0 mt-0.5">
                <b.icon className="w-4 h-4 text-blue-400" />
              </div>
              <div>
                <p className="text-gray-900 text-sm font-medium">{b.title}</p>
                <p className="text-slate-500 text-xs">{b.desc}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Right: Phone mockup */}
      <div className="flex-1 flex justify-center">
        <PhoneMockup isActive={isActive}>
          {/* Estimate badge */}
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={isActive ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.8 }}
            transition={{ type: 'spring', damping: 12, delay: 0.4 }}
            className="inline-block bg-blue-50 border border-blue-200 rounded-md px-2 py-0.5 mb-3"
          >
            <span className="text-[9px] font-bold text-blue-600 tracking-wider">ESTIMATE</span>
          </motion.div>

          {/* Estimate number */}
          <p className="text-[10px] text-text-muted font-mono mb-0.5">
            <TypewriterText text="#EST-2024-042" isActive={isActive} delay={500} speed={40} />
          </p>
          {/* Title */}
          <p className="text-gray-900 text-xs font-bold mb-0.5">
            <TypewriterText text="Kitchen Remodel" isActive={isActive} delay={800} speed={50} />
          </p>
          {/* Client */}
          <p className="text-text-muted text-[10px] mb-3">
            <TypewriterText text="Client: Johnson" isActive={isActive} delay={1100} speed={40} />
          </p>

          {/* Line items */}
          <div className="border-t border-gray-100 pt-2 space-y-1.5">
            {lineItems.map((line, i) => (
              <motion.div
                key={line.item}
                initial={{ opacity: 0, y: 8 }}
                animate={isActive ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 }}
                transition={{ type: 'spring', damping: 15, delay: 1.3 + i * 0.2 }}
                className="flex justify-between text-[10px]"
              >
                <span className="text-text-secondary">{line.item}</span>
                <span className="text-gray-900 font-medium">{line.price}</span>
              </motion.div>
            ))}
          </div>

          {/* Total */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={isActive ? { opacity: 1 } : { opacity: 0 }}
            transition={{ duration: 0.4, delay: 2.3 }}
            className="border-t border-gray-100 mt-2 pt-2 flex justify-between items-center"
          >
            <span className="text-text-secondary text-[10px] font-semibold">Total</span>
            <div className="flex items-center gap-1.5">
              <span className="text-gray-900 font-bold text-sm">
                $<CountUpNumber value={12500} isActive={isActive} delay={2400} duration={1200} />
              </span>
              <motion.div
                initial={{ opacity: 0, scale: 0 }}
                animate={isActive ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0 }}
                transition={{ type: 'spring', damping: 8, stiffness: 200, delay: 2.6 }}
              >
                <CheckCircleIcon className="w-4 h-4 text-emerald-400" />
              </motion.div>
            </div>
          </motion.div>
        </PhoneMockup>
      </div>
    </div>
  );
}
