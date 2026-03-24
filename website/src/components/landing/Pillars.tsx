'use client';

import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import { CheckCircleIcon } from '@heroicons/react/24/solid';
import { PILLARS } from '@/lib/constants';

function MockEstimate() {
  return (
    <div className="card-elevated p-5 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-gray-900 text-sm font-bold">Estimate #EST-2024-042</span>
        <span className="text-emerald-600 text-xs font-medium bg-emerald-50 px-2.5 py-0.5 rounded-full">Sent</span>
      </div>
      <p className="text-text-muted text-xs">John&apos;s Kitchen Remodel</p>
      <div className="space-y-2 pt-3 border-t border-border">
        {[
          { item: 'Cabinet Installation', price: '$4,200' },
          { item: 'Countertop (Granite)', price: '$3,800' },
          { item: 'Plumbing & Fixtures', price: '$2,450' },
          { item: 'Electrical Work', price: '$2,000' },
        ].map((line) => (
          <div key={line.item} className="flex justify-between text-sm">
            <span className="text-text-secondary">{line.item}</span>
            <span className="text-gray-900 font-medium">{line.price}</span>
          </div>
        ))}
      </div>
      <div className="pt-3 border-t border-border flex justify-between">
        <span className="text-text-secondary text-sm font-semibold">Total</span>
        <span className="text-gray-900 font-bold text-lg">$12,450</span>
      </div>
      <div className="flex gap-2 pt-1">
        <div className="flex-1 bg-primary text-white text-xs font-semibold py-2 rounded-lg text-center">Send via SMS</div>
        <div className="flex-1 bg-emerald-500 text-white text-xs font-semibold py-2 rounded-lg text-center">WhatsApp</div>
      </div>
    </div>
  );
}

function MockProject() {
  return (
    <div className="card-elevated p-5">
      <div className="flex justify-between items-start mb-4">
        <div>
          <p className="text-gray-900 text-sm font-bold">Bathroom Remodel</p>
          <p className="text-text-muted text-xs">Johnson Residence</p>
        </div>
        <span className="text-primary text-xs font-semibold bg-blue-50 px-2.5 py-0.5 rounded-full">On Track</span>
      </div>
      <div className="space-y-3">
        {[
          { phase: 'Demo & Prep', progress: 100, tasks: '4/4', status: 'Complete' },
          { phase: 'Plumbing Rough-In', progress: 100, tasks: '3/3', status: 'Complete' },
          { phase: 'Tile & Flooring', progress: 60, tasks: '2/5', status: 'In Progress' },
          { phase: 'Fixtures & Finish', progress: 0, tasks: '0/4', status: 'Upcoming' },
        ].map((p) => (
          <div key={p.phase} className="bg-surface rounded-xl p-3 border border-border">
            <div className="flex justify-between items-center mb-1.5">
              <p className="text-gray-900 text-xs font-medium">{p.phase}</p>
              <span className={`text-[10px] font-medium ${
                p.status === 'Complete' ? 'text-emerald-600' :
                p.status === 'In Progress' ? 'text-primary' : 'text-text-muted'
              }`}>{p.tasks} tasks</span>
            </div>
            <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                whileInView={{ width: `${p.progress}%` }}
                viewport={{ once: true }}
                transition={{ duration: 0.8, ease: 'easeOut' }}
                className={`h-full rounded-full ${
                  p.progress === 100 ? 'bg-emerald-500' : p.progress > 0 ? 'bg-primary' : 'bg-gray-200'
                }`}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MockInvoice() {
  return (
    <div className="card-elevated p-5">
      <p className="text-text-muted text-xs font-medium uppercase tracking-wider mb-3">Accounts Receivable</p>
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-surface rounded-xl p-3 border border-border">
          <p className="text-text-muted text-[10px]">Total Outstanding</p>
          <p className="text-gray-900 text-lg font-bold">$18,200</p>
        </div>
        <div className="bg-surface rounded-xl p-3 border border-border">
          <p className="text-text-muted text-[10px]">Overdue</p>
          <p className="text-red-600 text-lg font-bold">$4,500</p>
        </div>
      </div>
      <div className="space-y-2.5">
        {[
          { client: 'Johnson Kitchen', amount: '$6,200', status: 'Current', color: 'text-emerald-600 bg-emerald-50' },
          { client: 'Smith Roof', amount: '$7,500', status: 'Partial', color: 'text-amber-600 bg-amber-50' },
          { client: 'Davis HVAC', amount: '$4,500', status: '45 days', color: 'text-red-600 bg-red-50' },
        ].map((inv) => (
          <div key={inv.client} className="flex items-center justify-between bg-surface rounded-xl p-3 border border-border">
            <div>
              <p className="text-gray-900 text-xs font-medium">{inv.client}</p>
              <p className="text-gray-900 text-sm font-bold">{inv.amount}</p>
            </div>
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${inv.color}`}>{inv.status}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function MockFinancial() {
  const bars = [35, 55, 45, 70, 60, 85, 75];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul'];
  return (
    <div className="card-elevated p-5">
      <div className="flex justify-between items-start mb-5">
        <div>
          <p className="text-text-muted text-xs font-medium uppercase tracking-wider">Revenue</p>
          <p className="text-3xl font-extrabold text-gray-900 mt-1">$48,200</p>
          <p className="text-emerald-600 text-sm font-semibold">+23% vs last month</p>
        </div>
        <div className="text-right bg-emerald-50 rounded-xl px-3 py-2">
          <p className="text-text-muted text-[10px]">Net Profit</p>
          <p className="text-emerald-600 text-lg font-bold">$16,400</p>
        </div>
      </div>
      <div className="flex items-end gap-2.5 h-28">
        {bars.map((h, i) => (
          <div key={i} className="flex-1 flex flex-col items-center gap-1.5">
            <motion.div
              initial={{ height: 0 }}
              whileInView={{ height: `${h}%` }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.08 * i, ease: 'easeOut' }}
              className="w-full bg-gradient-to-t from-primary to-blue-400 rounded-t-md"
            />
            <span className="text-[10px] text-text-muted">{months[i]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const mocks: Record<string, React.FC> = {
  estimate: MockEstimate,
  project: MockProject,
  invoice: MockInvoice,
  financial: MockFinancial,
};

function PillarItem({ pillar, index }: { pillar: (typeof PILLARS)[number]; index: number }) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-80px' });
  const isReversed = index % 2 === 1;
  const Mock = mocks[pillar.mock];

  return (
    <div
      ref={ref}
      className={`flex flex-col ${isReversed ? 'lg:flex-row-reverse' : 'lg:flex-row'} items-center gap-12 lg:gap-20`}
    >
      <motion.div
        initial={{ opacity: 0, x: isReversed ? 40 : -40 }}
        animate={isInView ? { opacity: 1, x: 0 } : {}}
        transition={{ duration: 0.6 }}
        className="flex-1"
      >
        <span className="inline-block text-primary text-xs font-bold tracking-wider uppercase bg-blue-50 px-3 py-1 rounded-full mb-4">
          {pillar.label}
        </span>
        <h3 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-gray-900 mb-4 leading-tight">
          {pillar.title}
        </h3>
        <p className="text-text-secondary mb-6 leading-relaxed text-base">{pillar.description}</p>
        <ul className="space-y-3">
          {pillar.bullets.map((bullet) => (
            <li key={bullet} className="flex items-start gap-3">
              <CheckCircleIcon className="h-5 w-5 text-emerald-500 mt-0.5 shrink-0" />
              <span className="text-gray-700 text-sm">{bullet}</span>
            </li>
          ))}
        </ul>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, x: isReversed ? -40 : 40 }}
        animate={isInView ? { opacity: 1, x: 0 } : {}}
        transition={{ duration: 0.6, delay: 0.2 }}
        className="flex-1 w-full max-w-md"
      >
        {Mock && <Mock />}
      </motion.div>
    </div>
  );
}

export default function Pillars() {
  return (
    <section id="features" className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-20 space-y-28 sm:space-y-36">
      <div className="text-center">
        <p className="text-primary text-sm font-semibold tracking-wider uppercase mb-3">
          Features
        </p>
        <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-gray-900 mb-5">
          One App to <span className="gradient-text">Run Everything</span>
        </h2>
        <p className="text-text-secondary max-w-2xl mx-auto text-lg">
          Stop juggling spreadsheets, texts, and paper. Sylk handles estimates, projects, teams, and finances in one place.
        </p>
      </div>

      {PILLARS.map((pillar, i) => (
        <PillarItem key={pillar.label} pillar={pillar} index={i} />
      ))}
    </section>
  );
}
