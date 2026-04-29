import Link from 'next/link';
import { SITE } from '@/lib/constants';

const COLUMNS: Array<{ title: string; items: Array<{ label: string; href: string }> }> = [
  {
    title: 'Product',
    items: [
      { label: 'Features', href: '#features' },
      { label: 'How it works', href: '#how-it-works' },
      { label: 'Pricing', href: '#pricing' },
      { label: 'Industries', href: '#industries' },
    ],
  },
  {
    title: 'Company',
    items: [
      { label: 'Customers', href: '#testimonials' },
      { label: 'Login', href: '/login' },
      { label: 'Sign up', href: '/signup' },
    ],
  },
  {
    title: 'Legal',
    items: [
      { label: 'Privacy', href: '/privacy' },
      { label: 'Terms', href: '/terms' },
      { label: 'support@sylkapp.ai', href: 'mailto:support@sylkapp.ai' },
    ],
  },
];

export default function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="relative border-t border-black/[0.06] bg-[#fafafa]">
      <div className="mx-auto max-w-6xl px-6 md:px-8 py-16 md:py-24">
        <div className="grid grid-cols-2 md:grid-cols-12 gap-10 md:gap-8">
          <div className="col-span-2 md:col-span-5">
            <Link href="/" className="inline-flex items-center gap-2.5">
              <span className="grid h-7 w-7 place-items-center rounded-md bg-[#171717] text-white text-[12px] font-semibold tracking-tight">
                S
              </span>
              <span className="text-[15px] font-semibold tracking-tight text-[#171717]">
                {SITE.name}
              </span>
            </Link>
            <p className="mt-5 max-w-sm text-[14px] leading-relaxed text-[#525252]">
              The AI-powered cockpit for service businesses. Estimates, projects,
              finances and a 60-tool agent — engineered into one calm surface.
            </p>
            <p className="mt-6 inline-flex items-center gap-2 text-[11px] font-mono tabular-nums text-[#a3a3a3]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#34c759]" />
              All systems operational
            </p>
          </div>

          {COLUMNS.map((col) => (
            <div key={col.title} className="md:col-span-2">
              <h4 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#a3a3a3]">
                {col.title}
              </h4>
              <ul className="mt-4 space-y-2.5">
                {col.items.map((item) => (
                  <li key={item.label}>
                    <Link
                      href={item.href}
                      className="text-[13px] text-[#525252] hover:text-[#171717] transition-colors"
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          <div className="col-span-2 md:col-span-1 flex md:justify-end">
            <p className="text-[11px] font-mono tabular-nums text-[#a3a3a3]">
              v1.0.0
            </p>
          </div>
        </div>

        <div className="mt-16 h-px bg-gradient-to-r from-transparent via-black/10 to-transparent" />

        <div className="mt-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <p className="text-[12px] text-[#a3a3a3]">
            &copy; {year} {SITE.name}. All rights reserved.
          </p>
          <p className="text-[12px] text-[#a3a3a3]">
            Built in California · Engineered for the trades.
          </p>
        </div>
      </div>
    </footer>
  );
}
