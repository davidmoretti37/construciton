'use client';

import { motion } from 'framer-motion';
import { CheckCircleIcon } from '@heroicons/react/24/solid';
import { ArrowTrendingUpIcon, DocumentTextIcon, CurrencyDollarIcon } from '@heroicons/react/24/outline';
import CountUpNumber from './CountUpNumber';

const chartData = [
  { month: 'Jan', value: 8500, height: 35 },
  { month: 'Feb', value: 12300, height: 55 },
  { month: 'Mar', value: 9800, height: 45 },
  { month: 'Apr', value: 15200, height: 70 },
  { month: 'May', value: 11400, height: 52 },
];

const bullets = [
  { icon: ArrowTrendingUpIcon, title: 'Real-time profit per project', desc: 'Know exactly what each job makes' },
  { icon: DocumentTextIcon, title: 'Create invoices in 30 seconds', desc: 'One-tap from estimates' },
  { icon: CurrencyDollarIcon, title: 'Track who owes you', desc: 'AR aging: current, 30, 60, 90+ days' },
];

export default function SceneFinancials({ isActive }: { isActive: boolean }) {
  return (
    <div className="flex flex-col lg:flex-row items-center gap-4 lg:gap-16 w-full max-w-6xl mx-auto px-4 sm:px-6">
      {/* Left: Text */}
      <div className="flex-1 text-center lg:text-left">
        <motion.p
          initial={{ opacity: 0 }}
          animate={isActive ? { opacity: 1 } : { opacity: 0 }}
          transition={{ duration: 0.4 }}
          className="text-amber-600 text-xs sm:text-sm font-semibold tracking-wider uppercase mb-2"
        >
          Financials
        </motion.p>
        <motion.h3
          initial={{ opacity: 0, y: 20 }}
          animate={isActive ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
          transition={{ type: 'spring', damping: 15, stiffness: 100 }}
          className="text-2xl sm:text-3xl lg:text-5xl font-extrabold text-gray-900 mb-2 sm:mb-5 leading-tight"
        >
          Know Your Numbers.{' '}
          <span className="bg-gradient-to-r from-amber-500 to-orange-500 bg-clip-text text-transparent">
            Grow Your Business.
          </span>
        </motion.h3>
        <motion.p
          initial={{ opacity: 0, y: 15 }}
          animate={isActive ? { opacity: 1, y: 0 } : { opacity: 0, y: 15 }}
          transition={{ duration: 0.5, delay: 0.15 }}
          className="text-text-secondary text-sm sm:text-base leading-relaxed mb-4 lg:mb-8 max-w-md mx-auto lg:mx-0"
        >
          Connect your bank account. Categorize transactions by project. See exactly what each job costs and makes.
        </motion.p>

        <div className="hidden lg:block space-y-4">
          {bullets.map((b, i) => (
            <motion.div
              key={b.title}
              initial={{ opacity: 0, x: -20 }}
              animate={isActive ? { opacity: 1, x: 0 } : { opacity: 0, x: -20 }}
              transition={{ duration: 0.4, delay: 2.8 + i * 0.15 }}
              className="flex items-start gap-3 text-left"
            >
              <div className="w-9 h-9 rounded-lg bg-amber-50 flex items-center justify-center shrink-0 mt-0.5">
                <b.icon className="w-4 h-4 text-amber-600" />
              </div>
              <div>
                <p className="text-gray-900 text-sm font-medium">{b.title}</p>
                <p className="text-text-muted text-xs">{b.desc}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Right: Financial card */}
      <div className="flex-1 flex justify-center">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={isActive ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
          transition={{ type: 'spring', damping: 20, stiffness: 80, delay: 0.2 }}
          className="w-full max-w-[320px] sm:max-w-[360px] relative"
        >
          <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-xl">
            {/* Header */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={isActive ? { opacity: 1 } : { opacity: 0 }}
              transition={{ duration: 0.3, delay: 0.4 }}
              className="flex justify-between items-start mb-6"
            >
              <div>
                <p className="text-[10px] font-bold text-text-muted tracking-wider">FINANCIALS</p>
                <p className="text-text-muted text-[10px]">November 2024</p>
              </div>
              <div className="bg-emerald-50 rounded-lg px-2.5 py-1.5 text-right">
                <p className="text-[8px] text-text-muted">Net Profit</p>
                <p className="text-emerald-600 text-sm font-bold">
                  $<CountUpNumber value={16900} isActive={isActive} delay={2200} duration={1000} />
                </p>
              </div>
            </motion.div>

            {/* Bar chart */}
            <div className="flex items-end gap-3 mb-6" style={{ height: 128 }}>
              {chartData.map((bar, i) => (
                <div key={bar.month} className="flex-1 flex flex-col items-end justify-end gap-1.5 h-full">
                  <motion.div
                    initial={{ height: 0 }}
                    animate={isActive ? { height: `${bar.height}%` } : { height: 0 }}
                    transition={{
                      type: 'spring',
                      damping: 8,
                      stiffness: 100,
                      delay: 0.5 + i * 0.12,
                    }}
                    className="w-full bg-gradient-to-t from-primary to-blue-400 rounded-t-md"
                    style={{ minHeight: isActive ? 4 : 0 }}
                  />
                  <span className="text-[9px] text-text-muted w-full text-center">{bar.month}</span>
                </div>
              ))}
            </div>

            {/* Summary rows */}
            <div className="space-y-2.5">
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={isActive ? { opacity: 1, x: 0 } : { opacity: 0, x: -20 }}
                transition={{ duration: 0.4, delay: 1.4 }}
                className="flex justify-between items-center"
              >
                <span className="text-text-secondary text-xs">Revenue</span>
                <span className="text-gray-900 font-bold text-sm">
                  $<CountUpNumber value={45200} isActive={isActive} delay={1400} duration={1000} />
                </span>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={isActive ? { opacity: 1, x: 0 } : { opacity: 0, x: -20 }}
                transition={{ duration: 0.4, delay: 1.7 }}
                className="flex justify-between items-center"
              >
                <span className="text-text-secondary text-xs">Expenses</span>
                <span className="text-red-500 font-bold text-sm">
                  -$<CountUpNumber value={28300} isActive={isActive} delay={1700} duration={1000} />
                </span>
              </motion.div>

              {/* Divider */}
              <motion.div
                initial={{ scaleX: 0 }}
                animate={isActive ? { scaleX: 1 } : { scaleX: 0 }}
                transition={{ duration: 0.4, delay: 2.0 }}
                className="h-px bg-gray-200 origin-left"
              />

              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={isActive ? { opacity: 1, x: 0 } : { opacity: 0, x: -20 }}
                transition={{ duration: 0.4, delay: 2.1 }}
                className="flex justify-between items-center"
              >
                <span className="text-emerald-600 text-xs font-semibold">PROFIT</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-emerald-600 font-bold text-base">
                    $<CountUpNumber value={16900} isActive={isActive} delay={2100} duration={1000} />
                  </span>
                  <motion.div
                    initial={{ opacity: 0, scale: 0 }}
                    animate={isActive ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0 }}
                    transition={{ type: 'spring', damping: 8, stiffness: 200, delay: 2.5 }}
                  >
                    <CheckCircleIcon className="w-4 h-4 text-emerald-500" />
                  </motion.div>
                </div>
              </motion.div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
