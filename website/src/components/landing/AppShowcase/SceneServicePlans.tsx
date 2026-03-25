'use client';

import { motion } from 'framer-motion';
import { CheckCircleIcon } from '@heroicons/react/24/solid';
import { MapPinIcon, ClipboardDocumentCheckIcon, CreditCardIcon, SparklesIcon } from '@heroicons/react/24/outline';

const stops = [
  { name: 'Smith Office', service: 'Pest Control', status: 'Complete', time: '8:30 AM' },
  { name: 'Oak Plaza', service: 'Pest Control', status: 'In Progress', time: '10:00 AM' },
  { name: 'Main St Warehouse', service: 'Pest Control', status: 'Pending', time: '11:30 AM' },
];

const bullets = [
  { icon: MapPinIcon, title: 'Route management with ordered daily stops', desc: 'Optimized for efficiency' },
  { icon: ClipboardDocumentCheckIcon, title: 'Visit checklists per location', desc: 'Never miss a step' },
  { icon: CreditCardIcon, title: 'One-tap billing from completed visits', desc: 'Invoice on the spot' },
  { icon: SparklesIcon, title: 'AI creates full plans with one conversation', desc: 'Plan, location, schedule, checklist' },
];

export default function SceneServicePlans({ isActive }: { isActive: boolean }) {
  return (
    <div className="flex flex-col lg:flex-row items-center gap-4 lg:gap-16 w-full max-w-6xl mx-auto px-4 sm:px-6">
      {/* Left: Text */}
      <div className="flex-1 text-center lg:text-left">
        <motion.p
          initial={{ opacity: 0 }}
          animate={isActive ? { opacity: 1 } : { opacity: 0 }}
          transition={{ duration: 0.4 }}
          className="text-emerald-600 text-xs sm:text-sm font-semibold tracking-wider uppercase mb-2"
        >
          Recurring Services
        </motion.p>
        <motion.h3
          initial={{ opacity: 0, y: 20 }}
          animate={isActive ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
          transition={{ type: 'spring', damping: 15, stiffness: 100 }}
          className="text-2xl sm:text-3xl lg:text-5xl font-extrabold text-gray-900 mb-2 sm:mb-5 leading-tight"
        >
          Service Plans for{' '}
          <span className="bg-gradient-to-r from-emerald-500 to-cyan-500 bg-clip-text text-transparent">
            Route-Based Businesses
          </span>
        </motion.h3>
        <motion.p
          initial={{ opacity: 0, y: 15 }}
          animate={isActive ? { opacity: 1, y: 0 } : { opacity: 0, y: 15 }}
          transition={{ duration: 0.5, delay: 0.15 }}
          className="text-text-secondary text-sm sm:text-base leading-relaxed mb-4 lg:mb-8 max-w-md mx-auto lg:mx-0"
        >
          For pest control, cleaning, lawn care, pool service — create service plans with locations, visit schedules, and checklists.
        </motion.p>

        <div className="hidden lg:block space-y-4">
          {bullets.map((b, i) => (
            <motion.div
              key={b.title}
              initial={{ opacity: 0, x: -20 }}
              animate={isActive ? { opacity: 1, x: 0 } : { opacity: 0, x: -20 }}
              transition={{ duration: 0.4, delay: 1.8 + i * 0.15 }}
              className="flex items-start gap-3 text-left"
            >
              <div className="w-9 h-9 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0 mt-0.5">
                <b.icon className="w-4 h-4 text-emerald-600" />
              </div>
              <div>
                <p className="text-gray-900 text-sm font-medium">{b.title}</p>
                <p className="text-text-muted text-xs">{b.desc}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Right: Route card */}
      <div className="flex-1 flex justify-center">
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={isActive ? { opacity: 1, y: 0 } : { opacity: 0, y: 40 }}
          transition={{ type: 'spring', damping: 20, stiffness: 80, delay: 0.2 }}
          className="w-full max-w-[320px] relative"
        >
          <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-xl">
            {/* Header */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={isActive ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }}
              transition={{ duration: 0.4, delay: 0.4 }}
              className="flex justify-between items-center mb-5"
            >
              <div>
                <p className="text-gray-900 text-sm font-bold">Today&apos;s Route</p>
                <p className="text-text-muted text-xs">3 stops &middot; Pest Control</p>
              </div>
              <span className="text-emerald-600 text-[10px] font-semibold bg-emerald-50 border border-emerald-100 px-2.5 py-1 rounded-full">
                In Progress
              </span>
            </motion.div>

            {/* Stops */}
            <div className="space-y-3">
              {stops.map((stop, i) => (
                <motion.div
                  key={stop.name}
                  initial={{ opacity: 0, x: 30 }}
                  animate={isActive ? { opacity: 1, x: 0 } : { opacity: 0, x: 30 }}
                  transition={{ type: 'spring', damping: 15, delay: 0.7 + i * 0.25 }}
                  className="flex items-center gap-3 bg-gray-50 border border-gray-100 rounded-xl p-3"
                >
                  <div className="flex flex-col items-center">
                    <div
                      className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                        stop.status === 'Complete'
                          ? 'bg-emerald-50 text-emerald-600'
                          : stop.status === 'In Progress'
                          ? 'bg-blue-50 text-blue-600'
                          : 'bg-gray-100 text-text-muted'
                      }`}
                    >
                      {stop.status === 'Complete' ? (
                        <CheckCircleIcon className="w-4 h-4" />
                      ) : (
                        i + 1
                      )}
                    </div>
                  </div>

                  <div className="flex-1">
                    <p className="text-gray-900 text-xs font-medium">{stop.name}</p>
                    <p className="text-text-muted text-[10px]">{stop.service} &middot; {stop.time}</p>
                  </div>

                  <motion.span
                    initial={{ opacity: 0, scale: 0.5 }}
                    animate={isActive ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.5 }}
                    transition={{ type: 'spring', damping: 10, delay: 1.0 + i * 0.25 }}
                    className={`text-[9px] font-semibold px-2 py-0.5 rounded-full ${
                      stop.status === 'Complete'
                        ? 'text-emerald-600 bg-emerald-50'
                        : stop.status === 'In Progress'
                        ? 'text-blue-600 bg-blue-50'
                        : 'text-text-muted bg-gray-100'
                    }`}
                  >
                    {stop.status === 'Complete' ? 'Done' : stop.status}
                  </motion.span>
                </motion.div>
              ))}
            </div>

            {/* Bottom stat */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={isActive ? { opacity: 1 } : { opacity: 0 }}
              transition={{ duration: 0.4, delay: 1.6 }}
              className="mt-4 pt-3 border-t border-gray-100 flex justify-between text-[10px]"
            >
              <span className="text-text-muted">1 of 3 complete</span>
              <span className="text-emerald-600 font-medium">33% done</span>
            </motion.div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
