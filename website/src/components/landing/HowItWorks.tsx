'use client';

import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import {
  ChatBubbleLeftRightIcon,
  DocumentCheckIcon,
  BanknotesIcon,
} from '@heroicons/react/24/outline';
import SectionWrapper from '@/components/ui/SectionWrapper';

const steps = [
  {
    number: '01',
    icon: ChatBubbleLeftRightIcon,
    title: 'Tell Your AI What You Need',
    description:
      'Describe the job by voice or text. "Create an estimate for a kitchen remodel, cabinets, countertops, plumbing." Your AI handles the rest.',
    color: 'bg-blue-50 text-blue-600',
  },
  {
    number: '02',
    icon: DocumentCheckIcon,
    title: 'Send, Track, Get Approved',
    description:
      'AI generates a detailed estimate with your pricing. Send it to the client via SMS or WhatsApp. Track when they view and accept it.',
    color: 'bg-cyan-50 text-cyan-600',
  },
  {
    number: '03',
    icon: BanknotesIcon,
    title: 'Manage the Job, Get Paid',
    description:
      'The estimate becomes a project with phases and tasks. Your crew clocks in, submits daily reports. Convert to invoices and track every dollar.',
    color: 'bg-emerald-50 text-emerald-600',
  },
];

export default function HowItWorks() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-60px' });

  return (
    <SectionWrapper id="how-it-works">
      <div className="text-center mb-16">
        <p className="text-primary text-sm font-semibold tracking-wider uppercase mb-3">
          How It Works
        </p>
        <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-gray-900 mb-5">
          From Quote to Cash
          <br />
          <span className="gradient-text">in Three Steps</span>
        </h2>
        <p className="text-text-secondary max-w-2xl mx-auto text-lg">
          Your AI assistant handles the busywork. You focus on the job.
        </p>
      </div>

      <div ref={ref} className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
        {steps.map((step, i) => {
          const Icon = step.icon;
          return (
            <motion.div
              key={step.number}
              initial={{ opacity: 0, y: 30 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.5, delay: i * 0.15 }}
              className="relative text-center"
            >
              {/* Connector line */}
              {i < steps.length - 1 && (
                <div className="hidden md:block absolute top-12 left-[60%] w-[80%] h-px border-t-2 border-dashed border-gray-200" />
              )}

              <div className={`inline-flex items-center justify-center w-16 h-16 rounded-2xl ${step.color} mb-5`}>
                <Icon className="h-7 w-7" />
              </div>

              <p className="text-primary text-xs font-bold tracking-wider uppercase mb-2">
                Step {step.number}
              </p>
              <h3 className="text-gray-900 font-bold text-lg mb-3">{step.title}</h3>
              <p className="text-text-secondary text-sm leading-relaxed">{step.description}</p>
            </motion.div>
          );
        })}
      </div>
    </SectionWrapper>
  );
}
