'use client';

import { motion, type Variants } from 'framer-motion';
import { ArrowRightIcon, ArrowUpRightIcon } from '@heroicons/react/16/solid';
import Button from '@/components/ui/Button';

const HEADLINE = ['The', 'command', 'center', 'for', 'service', 'businesses.'];

const containerStagger: Variants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.06, delayChildren: 0.2 },
  },
};

const wordReveal: Variants = {
  hidden: { y: '105%', opacity: 0 },
  show: {
    y: 0,
    opacity: 1,
    transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] },
  },
};

const fadeUp = (delay: number): Variants => ({
  hidden: { y: 14, opacity: 0 },
  show: {
    y: 0,
    opacity: 1,
    transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1], delay },
  },
});

export default function Hero() {
  return (
    <section
      id="hero"
      className="relative isolate overflow-hidden bg-[#fafafa] pt-32 md:pt-40 pb-20 md:pb-32"
    >
      {/* Atmospheric layer 1 — accent radial wash from top */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[820px]"
        style={{
          background:
            'radial-gradient(ellipse 60% 55% at 50% -5%, rgba(0,113,227,0.10), transparent 70%)',
        }}
      />

      {/* Atmospheric layer 2 — fine dot grid with radial mask */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[900px] opacity-[0.6]"
        style={{
          backgroundImage:
            'radial-gradient(circle at 1px 1px, rgba(23,23,23,0.10) 1px, transparent 0)',
          backgroundSize: '28px 28px',
          maskImage:
            'radial-gradient(ellipse 70% 60% at 50% 28%, black 30%, transparent 75%)',
          WebkitMaskImage:
            'radial-gradient(ellipse 70% 60% at 50% 28%, black 30%, transparent 75%)',
        }}
      />

      {/* Atmospheric layer 3 — soft accent halo behind preview card */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-[640px] -z-10 h-[600px] w-[1100px] -translate-x-1/2 rounded-full opacity-70 blur-[120px]"
        style={{
          background:
            'radial-gradient(closest-side, rgba(0,113,227,0.10), transparent)',
        }}
      />

      <div className="mx-auto max-w-6xl px-6 md:px-8">
        {/* Eyebrow */}
        <motion.div
          initial="hidden"
          animate="show"
          variants={fadeUp(0.1)}
          className="flex justify-center"
        >
          <span className="inline-flex items-center gap-2 rounded-full bg-white/70 backdrop-blur px-3 py-1 ring-1 ring-black/[0.06] shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#0071e3] opacity-60" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#0071e3]" />
            </span>
            <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#525252]">
              v1.0 · Now in early access
            </span>
          </span>
        </motion.div>

        {/* Headline — word-by-word reveal */}
        <motion.h1
          initial="hidden"
          animate="show"
          variants={containerStagger}
          className="mt-7 text-center font-semibold text-[#171717]"
          style={{ fontFeatureSettings: '"ss01"' }}
        >
          <span className="block text-[44px] sm:text-[64px] md:text-[80px] lg:text-[96px] leading-[0.95] tracking-[-0.045em]">
            {HEADLINE.map((word, i) => (
              <span
                key={`${word}-${i}`}
                className="relative inline-block overflow-hidden align-bottom mr-[0.22em] last:mr-0"
              >
                <motion.span
                  variants={wordReveal}
                  className={`inline-block ${
                    word === 'service' || word === 'businesses.'
                      ? 'text-[#0071e3]'
                      : ''
                  }`}
                >
                  {word}
                </motion.span>
              </span>
            ))}
          </span>
        </motion.h1>

        {/* Subheading */}
        <motion.p
          initial="hidden"
          animate="show"
          variants={fadeUp(0.4)}
          className="mt-7 mx-auto max-w-2xl text-center text-[17px] md:text-lg leading-relaxed text-[#525252]"
        >
          Sylk is an AI-powered operating system for contractors and trades.
          Estimates, projects, finances, and a 60-tool agent — engineered into
          one calm, gallery-clean cockpit.
        </motion.p>

        {/* CTAs */}
        <motion.div
          initial="hidden"
          animate="show"
          variants={fadeUp(0.6)}
          className="mt-9 flex flex-col sm:flex-row items-center justify-center gap-3"
        >
          <Button href="#pricing" size="lg" className="group rounded-full px-7">
            Start free trial
            <ArrowRightIcon className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
          </Button>
          <Button
            href="#how-it-works"
            variant="ghost"
            size="lg"
            className="group rounded-full px-6 text-[#171717]"
          >
            See it in action
            <ArrowUpRightIcon className="h-4 w-4 text-[#525252] transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
          </Button>
        </motion.div>

        {/* Trust strip */}
        <motion.div
          initial="hidden"
          animate="show"
          variants={fadeUp(0.75)}
          className="mt-10 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-[12px]"
        >
          <span className="inline-flex items-center gap-2 text-[#525252]">
            <span className="font-mono tabular-nums text-[#171717] text-[13px] font-semibold">
              4.9
            </span>
            <span className="flex gap-0.5" aria-hidden>
              {[0, 1, 2, 3, 4].map((i) => (
                <svg
                  key={i}
                  className="h-3 w-3 text-[#171717]"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M12 2.5l2.95 6.46 7.05.62-5.37 4.7 1.62 6.92L12 17.6l-6.25 3.6 1.62-6.92L2 9.58l7.05-.62L12 2.5z" />
                </svg>
              ))}
            </span>
            <span>App Store</span>
          </span>
          <span className="hidden sm:block h-3 w-px bg-black/10" />
          <span className="inline-flex items-center gap-2 text-[#525252]">
            <span className="font-mono tabular-nums text-[#171717] text-[13px] font-semibold">
              500+
            </span>
            <span>service businesses</span>
          </span>
          <span className="hidden sm:block h-3 w-px bg-black/10" />
          <span className="inline-flex items-center gap-2 text-[#525252]">
            <span className="font-mono tabular-nums text-[#171717] text-[13px] font-semibold">
              60
            </span>
            <span>AI tools, one cockpit</span>
          </span>
        </motion.div>

        {/* Preview card */}
        <motion.div
          initial={{ y: 36, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1], delay: 0.85 }}
          className="relative mt-20 md:mt-24"
        >
          <CockpitPreview />
        </motion.div>
      </div>

      {/* Section connector — gradient fade divider */}
      <div className="mt-24 md:mt-32">
        <div className="mx-auto h-px max-w-6xl bg-gradient-to-r from-transparent via-black/10 to-transparent" />
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Cockpit preview — a hand-built faux-dashboard panel that shows the real   */
/*  shape of the product. Intentionally restrained to match the gallery /     */
/*  Vercel aesthetic: ring borders, 3-level type hierarchy, multi-layer       */
/*  shadow, single accent (#0071e3), JetBrains Mono on numerics.              */
/* -------------------------------------------------------------------------- */

const KPIS: Array<{
  label: string;
  value: string;
  delta: string;
  trend: 'up' | 'down';
  series: number[];
}> = [
  {
    label: 'Active projects',
    value: '12',
    delta: '+2',
    trend: 'up',
    series: [6, 7, 7, 8, 9, 10, 12],
  },
  {
    label: 'Outstanding AR',
    value: '$48.2k',
    delta: '−6.4%',
    trend: 'down',
    series: [62, 58, 55, 53, 51, 50, 48],
  },
  {
    label: 'Crew clocked in',
    value: '17',
    delta: '+3',
    trend: 'up',
    series: [11, 12, 14, 13, 15, 16, 17],
  },
  {
    label: 'Week revenue',
    value: '$28.9k',
    delta: '+12%',
    trend: 'up',
    series: [14, 18, 16, 21, 22, 26, 29],
  },
];

const PROJECTS: Array<{
  name: string;
  client: string;
  phase: string;
  progress: number;
  budget: string;
  updated: string;
}> = [
  {
    name: 'Westlake Residence',
    client: 'Hayes & Co.',
    phase: 'Framing',
    progress: 64,
    budget: '$184,200',
    updated: '3h ago',
  },
  {
    name: 'Riverdale Office Build',
    client: 'Pacific Holdings',
    phase: 'Permits',
    progress: 22,
    budget: '$612,000',
    updated: '8h ago',
  },
  {
    name: 'Maple Ave Remodel',
    client: 'J. Bennett',
    phase: 'Finishes',
    progress: 88,
    budget: '$92,400',
    updated: 'Yesterday',
  },
];

const TODAY: Array<{ time: string; title: string; meta: string }> = [
  { time: '09:00', title: 'Site visit · Westlake', meta: 'Mike R.' },
  { time: '11:30', title: 'Estimate review', meta: 'Pacific Holdings' },
  { time: '14:00', title: 'Crew sync', meta: '4 supervisors' },
];

function CockpitPreview() {
  return (
    <div
      className="relative mx-auto max-w-[1180px] rounded-[20px] bg-white ring-1 ring-black/[0.06] overflow-hidden"
      style={{
        boxShadow:
          '0 1px 2px rgba(0,0,0,0.04), 0 8px 16px rgba(0,0,0,0.05), 0 24px 48px rgba(0,0,0,0.06), 0 48px 96px rgba(0,0,0,0.05)',
      }}
    >
      {/* Window chrome */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-black/[0.05] bg-[#fafafa]">
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[#e5e5e5]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#e5e5e5]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#e5e5e5]" />
        </div>
        <div className="flex items-center gap-2 rounded-md bg-white px-3 py-1 ring-1 ring-black/[0.06]">
          <span className="h-1.5 w-1.5 rounded-full bg-[#0071e3]" />
          <span className="font-mono text-[11px] tracking-tight text-[#525252]">
            sylk.app/cockpit
          </span>
        </div>
        <div className="hidden sm:flex items-center gap-2">
          <span className="h-6 w-6 rounded-full bg-[#171717]" />
        </div>
      </div>

      {/* Body */}
      <div className="grid grid-cols-12 gap-0">
        {/* Side nav */}
        <aside className="hidden md:flex col-span-2 flex-col gap-1 border-r border-black/[0.05] p-3">
          <div className="flex items-center gap-2 px-2 py-2 mb-2">
            <span className="grid h-6 w-6 place-items-center rounded-md bg-[#171717] text-white text-[10px] font-semibold">
              S
            </span>
            <span className="text-[12px] font-semibold tracking-tight text-[#171717]">
              Sylk
            </span>
          </div>
          {[
            { label: 'Cockpit', active: true },
            { label: 'Projects' },
            { label: 'Estimates' },
            { label: 'Invoices' },
            { label: 'Crew' },
            { label: 'Clients' },
            { label: 'Settings' },
          ].map((item) => (
            <span
              key={item.label}
              className={`flex items-center justify-between px-2.5 py-1.5 rounded-md text-[12px] ${
                item.active
                  ? 'bg-[#0071e3]/[0.08] text-[#0071e3] font-medium'
                  : 'text-[#525252]'
              }`}
            >
              {item.label}
              {item.active && (
                <span className="h-1.5 w-1.5 rounded-full bg-[#0071e3]" />
              )}
            </span>
          ))}
        </aside>

        {/* Main */}
        <main className="col-span-12 md:col-span-7 p-5 md:p-6">
          <div className="flex items-end justify-between mb-5">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#a3a3a3]">
                Monday · Apr 28
              </p>
              <h3 className="mt-1 text-[20px] font-semibold tracking-tight text-[#171717]">
                Good morning, Diana
              </h3>
            </div>
            <span className="hidden sm:inline-flex items-center gap-2 rounded-full bg-[#171717] px-3 py-1.5 text-[11px] font-medium text-white">
              + New project
            </span>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {KPIS.map((kpi) => (
              <KpiCard key={kpi.label} kpi={kpi} />
            ))}
          </div>

          <div className="mt-6">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-[12px] font-semibold uppercase tracking-[0.06em] text-[#a3a3a3]">
                Active projects
              </h4>
              <span className="text-[11px] font-medium text-[#0071e3]">
                View all →
              </span>
            </div>
            <div className="rounded-xl ring-1 ring-black/[0.05] overflow-hidden">
              <div className="grid grid-cols-12 gap-3 px-4 py-2.5 bg-[#fafafa] text-[10px] font-semibold uppercase tracking-[0.08em] text-[#a3a3a3]">
                <span className="col-span-5">Project</span>
                <span className="col-span-2">Phase</span>
                <span className="col-span-3">Progress</span>
                <span className="col-span-2 text-right">Budget</span>
              </div>
              {PROJECTS.map((p, i) => (
                <div
                  key={p.name}
                  className={`grid grid-cols-12 gap-3 items-center px-4 py-3 text-[12px] ${
                    i !== PROJECTS.length - 1 ? 'border-b border-black/[0.04]' : ''
                  }`}
                >
                  <div className="col-span-5">
                    <div className="font-medium text-[#171717]">{p.name}</div>
                    <div className="text-[11px] text-[#a3a3a3]">{p.client}</div>
                  </div>
                  <span className="col-span-2 inline-flex w-fit items-center rounded-full bg-[#0071e3]/[0.08] px-2 py-0.5 text-[10px] font-medium text-[#0071e3]">
                    {p.phase}
                  </span>
                  <div className="col-span-3 flex items-center gap-2">
                    <div className="h-1.5 flex-1 rounded-full bg-[#efefef] overflow-hidden">
                      <div
                        className="h-full rounded-full bg-[#0071e3]"
                        style={{ width: `${p.progress}%` }}
                      />
                    </div>
                    <span className="font-mono tabular-nums text-[11px] text-[#525252] w-8 text-right">
                      {p.progress}%
                    </span>
                  </div>
                  <span className="col-span-2 text-right font-mono tabular-nums text-[11px] text-[#171717]">
                    {p.budget}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </main>

        {/* Right rail */}
        <aside className="hidden md:block col-span-3 border-l border-black/[0.05] p-5">
          <h4 className="text-[12px] font-semibold uppercase tracking-[0.06em] text-[#a3a3a3] mb-3">
            Today
          </h4>
          <ul className="space-y-2">
            {TODAY.map((t) => (
              <li
                key={t.title}
                className="flex items-start gap-3 rounded-lg px-2.5 py-2 hover:bg-[#fafafa] transition-colors"
              >
                <span className="font-mono tabular-nums text-[10px] text-[#a3a3a3] pt-0.5 w-9">
                  {t.time}
                </span>
                <span className="flex-1">
                  <span className="block text-[12px] font-medium text-[#171717] leading-tight">
                    {t.title}
                  </span>
                  <span className="block text-[11px] text-[#a3a3a3] mt-0.5">
                    {t.meta}
                  </span>
                </span>
              </li>
            ))}
          </ul>

          <div className="mt-6 rounded-xl ring-1 ring-black/[0.05] p-3">
            <div className="flex items-center gap-2 mb-2">
              <span className="grid h-5 w-5 place-items-center rounded-md bg-[#0071e3]/[0.08] text-[#0071e3] text-[10px] font-semibold">
                AI
              </span>
              <span className="text-[11px] font-semibold text-[#171717]">
                Sylk Agent
              </span>
              <span className="ml-auto h-1.5 w-1.5 rounded-full bg-[#34c759]" />
            </div>
            <p className="text-[11px] leading-snug text-[#525252]">
              Two estimates ready to send. Westlake invoice #2104 marked paid.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

function KpiCard({
  kpi,
}: {
  kpi: { label: string; value: string; delta: string; trend: 'up' | 'down'; series: number[] };
}) {
  return (
    <div
      className="rounded-xl bg-white ring-1 ring-black/[0.05] p-3.5"
      style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}
    >
      <div className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[#a3a3a3] leading-tight whitespace-nowrap">
        {kpi.label}
      </div>
      <div className="mt-2 flex items-baseline justify-between gap-2">
        <span className="font-mono tabular-nums text-[22px] font-semibold leading-none tracking-tight text-[#171717]">
          {kpi.value}
        </span>
        <span
          className={`font-mono tabular-nums text-[11px] font-semibold shrink-0 ${
            kpi.trend === 'up' ? 'text-[#0071e3]' : 'text-[#a3a3a3]'
          }`}
        >
          {kpi.delta}
        </span>
      </div>
      <Sparkline series={kpi.series} />
    </div>
  );
}

function Sparkline({ series }: { series: number[] }) {
  const w = 100;
  const h = 24;
  const min = Math.min(...series);
  const max = Math.max(...series);
  const range = max - min || 1;
  const step = w / (series.length - 1);
  const points = series.map((v, i) => {
    const x = i * step;
    const y = h - ((v - min) / range) * h;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });
  const pathLine = `M ${points.join(' L ')}`;
  const pathArea = `${pathLine} L ${w},${h} L 0,${h} Z`;
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      className="mt-3 h-6 w-full"
      aria-hidden
    >
      <defs>
        <linearGradient id="spark-fill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#0071e3" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#0071e3" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={pathArea} fill="url(#spark-fill)" />
      <path
        d={pathLine}
        fill="none"
        stroke="#0071e3"
        strokeWidth={1.25}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
