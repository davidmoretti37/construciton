'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Bars3Icon, XMarkIcon } from '@heroicons/react/24/outline';
import { NAV_LINKS, SITE } from '@/lib/constants';
import Button from '@/components/ui/Button';

export default function Navbar() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <>
      <motion.nav
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        className="fixed top-4 left-1/2 -translate-x-1/2 z-50 hidden md:block"
        aria-label="Primary"
      >
        <div
          className={`flex items-center gap-2 rounded-full pl-2 pr-2 py-2 ring-1 ring-black/[0.06] backdrop-blur-xl transition-all duration-300 ${
            scrolled
              ? 'bg-white/90 shadow-[0_2px_4px_rgba(0,0,0,0.04),0_8px_16px_rgba(0,0,0,0.05),0_16px_32px_rgba(0,0,0,0.04)]'
              : 'bg-white/75 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_1px_3px_rgba(0,0,0,0.06)]'
          }`}
        >
          <Link
            href="/"
            className="flex items-center gap-2 pl-2 pr-3 h-9 rounded-full hover:bg-[#f5f5f5] transition-colors"
          >
            <span className="grid place-items-center h-6 w-6 rounded-md bg-[#171717] text-white text-[11px] font-semibold tracking-tight">
              S
            </span>
            <span className="text-[14px] font-semibold tracking-tight text-[#171717]">
              {SITE.name}
            </span>
          </Link>

          <span className="h-5 w-px bg-black/10 mx-1" aria-hidden />

          <ul className="flex items-center gap-1">
            {NAV_LINKS.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  className="inline-flex items-center h-9 px-3 rounded-full text-[13px] font-medium text-[#525252] hover:text-[#171717] hover:bg-[#f5f5f5] transition-colors"
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>

          <span className="h-5 w-px bg-black/10 mx-1" aria-hidden />

          <Link
            href="/login"
            className="inline-flex items-center h-9 px-3 rounded-full text-[13px] font-medium text-[#525252] hover:text-[#171717] hover:bg-[#f5f5f5] transition-colors"
          >
            Sign in
          </Link>
          <Button href="#pricing" size="sm" className="rounded-full ml-1">
            Start free trial
          </Button>
        </div>
      </motion.nav>

      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="md:hidden fixed top-3 left-3 right-3 z-50"
      >
        <div className="flex items-center justify-between rounded-2xl bg-white/85 backdrop-blur-xl px-3 py-2 ring-1 ring-black/[0.06] shadow-[0_1px_2px_rgba(0,0,0,0.04),0_1px_3px_rgba(0,0,0,0.06)]">
          <Link href="/" className="flex items-center gap-2 px-2 py-1">
            <span className="grid place-items-center h-7 w-7 rounded-md bg-[#171717] text-white text-[11px] font-semibold">
              S
            </span>
            <span className="text-[15px] font-semibold tracking-tight text-[#171717]">
              {SITE.name}
            </span>
          </Link>
          <button
            type="button"
            onClick={() => setOpen((s) => !s)}
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
            className="grid place-items-center h-10 w-10 rounded-xl text-[#171717] hover:bg-[#f5f5f5] transition-colors"
          >
            {open ? <XMarkIcon className="h-5 w-5" /> : <Bars3Icon className="h-5 w-5" />}
          </button>
        </div>

        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="mt-2 rounded-2xl bg-white/95 backdrop-blur-xl ring-1 ring-black/[0.06] shadow-[0_4px_8px_rgba(0,0,0,0.04),0_16px_32px_rgba(0,0,0,0.06)] p-2 space-y-0.5"
          >
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="flex items-center h-11 px-3 rounded-xl text-[14px] font-medium text-[#171717] hover:bg-[#f5f5f5]"
              >
                {link.label}
              </a>
            ))}
            <Link
              href="/login"
              onClick={() => setOpen(false)}
              className="flex items-center h-11 px-3 rounded-xl text-[14px] font-medium text-[#171717] hover:bg-[#f5f5f5]"
            >
              Sign in
            </Link>
            <div className="pt-2">
              <Button href="#pricing" className="w-full">
                Start free trial
              </Button>
            </div>
          </motion.div>
        )}
      </motion.div>
    </>
  );
}
