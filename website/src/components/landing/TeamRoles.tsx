'use client';

import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import { CheckIcon } from '@heroicons/react/24/solid';
import { TEAM_FEATURES } from '@/lib/constants';
import SectionWrapper from '@/components/ui/SectionWrapper';

const colorMap: Record<string, { badge: string; icon: string; border: string }> = {
  blue: { badge: 'bg-blue-50 text-blue-700', icon: 'bg-blue-500', border: 'hover:border-blue-200' },
  violet: { badge: 'bg-violet-50 text-violet-700', icon: 'bg-violet-500', border: 'hover:border-violet-200' },
  emerald: { badge: 'bg-emerald-50 text-emerald-700', icon: 'bg-emerald-500', border: 'hover:border-emerald-200' },
};

export default function TeamRoles() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-60px' });

  return (
    <SectionWrapper>
      <div className="text-center mb-16">
        <p className="text-primary text-sm font-semibold tracking-wider uppercase mb-3">
          Team Management
        </p>
        <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-gray-900 mb-5">
          Your Whole Team,{' '}
          <span className="gradient-text">One App</span>
        </h2>
        <p className="text-text-secondary max-w-2xl mx-auto text-lg">
          Owners see the big picture. Supervisors manage sites. Workers clock in and report. Everyone stays in sync.
        </p>
      </div>

      <div ref={ref} className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
        {TEAM_FEATURES.map((team, i) => {
          const colors = colorMap[team.color];
          return (
            <motion.div
              key={team.role}
              initial={{ opacity: 0, y: 30 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.5, delay: i * 0.15 }}
              className={`card-elevated p-6 sm:p-8 hover:shadow-lg transition-all duration-300 ${colors.border}`}
            >
              <div className="flex items-center gap-3 mb-4">
                <div className={`w-10 h-10 rounded-full ${colors.icon} flex items-center justify-center text-white text-sm font-bold`}>
                  {team.role[0]}
                </div>
                <div>
                  <h3 className="text-gray-900 font-bold">{team.role}</h3>
                  <p className="text-text-muted text-xs">{team.description}</p>
                </div>
              </div>

              <ul className="space-y-3 mt-5">
                {team.capabilities.map((cap) => (
                  <li key={cap} className="flex items-start gap-2.5">
                    <CheckIcon className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
                    <span className="text-gray-700 text-sm">{cap}</span>
                  </li>
                ))}
              </ul>
            </motion.div>
          );
        })}
      </div>
    </SectionWrapper>
  );
}
