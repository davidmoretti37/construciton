'use client';

import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import { CheckIcon, ShieldCheckIcon } from '@heroicons/react/24/solid';
import { PLANS } from '@/lib/constants';
import Button from '@/components/ui/Button';
import SectionWrapper from '@/components/ui/SectionWrapper';

export default function Pricing() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-60px' });

  return (
    <SectionWrapper id="pricing">
      <div className="text-center mb-16">
        <motion.p
          initial={{ opacity: 0 }}
          animate={isInView ? { opacity: 1 } : {}}
          className="text-primary text-sm font-semibold tracking-wider uppercase mb-3"
        >
          Pricing
        </motion.p>
        <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-gray-900 mb-5">
          Simple, Transparent{' '}
          <span className="gradient-text">Pricing</span>
        </h2>
        <p className="text-text-secondary text-lg">Start with 7 days free. Cancel anytime.</p>
      </div>

      <div ref={ref} className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
        {PLANS.map((plan, i) => {
          const isBest = 'isBest' in plan && plan.isBest;
          return (
            <motion.div
              key={plan.id}
              initial={{ opacity: 0, y: 30 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.5, delay: i * 0.12 }}
              className={`group relative rounded-2xl p-6 sm:p-8 flex flex-col transition-all duration-300 hover:-translate-y-1 ${
                isBest
                  ? 'card-elevated glow-blue ring-2 ring-primary/20 hover:shadow-xl'
                  : 'card-elevated hover:shadow-lg'
              }`}
            >
              {isBest && (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                  <span className="bg-primary text-white text-xs font-bold px-4 py-1.5 rounded-full shadow-lg shadow-primary/20">
                    Most Popular
                  </span>
                </div>
              )}

              <div className="mb-6">
                <h3 className="text-gray-900 font-bold text-lg">{plan.name}</h3>
                <p className="text-text-muted text-sm">{plan.description}</p>
              </div>

              <div className="mb-8">
                <div className="flex items-baseline gap-1">
                  <span className="text-5xl font-extrabold text-gray-900">${plan.price}</span>
                  <span className="text-text-muted text-sm">/mo</span>
                </div>
                <p className="text-text-muted text-xs mt-1">Billed monthly</p>
              </div>

              <ul className="space-y-3.5 mb-8 flex-1">
                {plan.benefits.map((benefit) => (
                  <li key={benefit} className="flex items-start gap-2.5">
                    <CheckIcon className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
                    <span className="text-gray-700 text-sm">{benefit}</span>
                  </li>
                ))}
              </ul>

              <Button
                href="#"
                variant={isBest ? 'primary' : 'secondary'}
                className="w-full justify-center"
              >
                Start Free Trial
              </Button>
            </motion.div>
          );
        })}
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={isInView ? { opacity: 1 } : {}}
        transition={{ delay: 0.6 }}
        className="flex flex-wrap items-center justify-center gap-6 mt-12 text-text-muted text-xs"
      >
        <span className="flex items-center gap-1.5">
          <ShieldCheckIcon className="h-4 w-4" />
          Secure payments via Stripe
        </span>
        <span className="h-3 w-px bg-border hidden sm:block" />
        <span>Cancel anytime</span>
        <span className="h-3 w-px bg-border hidden sm:block" />
        <span>7-day free trial</span>
      </motion.div>
    </SectionWrapper>
  );
}
