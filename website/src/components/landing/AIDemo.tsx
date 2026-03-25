'use client';

import { useRef, useState, useEffect } from 'react';
import { motion, useInView, AnimatePresence } from 'framer-motion';
import { AI_CAPABILITIES } from '@/lib/constants';
import SectionWrapper from '@/components/ui/SectionWrapper';
import Image from 'next/image';

function TypingDots() {
  return (
    <div className="flex gap-1 items-center h-5">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-primary"
          animate={{ opacity: [0.3, 1, 0.3] }}
          transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.2 }}
        />
      ))}
    </div>
  );
}

export default function AIDemo() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-60px' });
  const [activeIndex, setActiveIndex] = useState(0);
  const [showResponse, setShowResponse] = useState(false);

  useEffect(() => {
    if (!isInView) return;
    const cycle = () => {
      setShowResponse(false);
      const timer = setTimeout(() => setShowResponse(true), 1200);
      return timer;
    };
    const timer = cycle();

    const interval = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % AI_CAPABILITIES.length);
      cycle();
    }, 4000);

    return () => {
      clearTimeout(timer);
      clearInterval(interval);
    };
  }, [isInView]);

  const current = AI_CAPABILITIES[activeIndex];

  return (
    <SectionWrapper className="bg-surface">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-12">
          <p className="text-primary text-sm font-semibold tracking-wider uppercase mb-3">
            AI Assistant
          </p>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-gray-900 mb-5">
            Just Tell It What
            <br />
            <span className="gradient-text">You Need Done</span>
          </h2>
          <p className="text-text-secondary max-w-2xl mx-auto text-lg">
            Foreman is your AI operations partner — 60 specialized tools, intent-based routing, and memory that learns your business. Create projects, generate estimates, reconcile bank transactions, manage routes, track daily quantities, and get proactive insights — all in plain language, in English, Spanish, or Portuguese.
          </p>
        </div>

        {/* Chat mockup */}
        <div ref={ref} className="card-elevated max-w-lg mx-auto overflow-hidden">
          {/* Chat header */}
          <div className="flex items-center gap-3 px-5 py-4 border-b border-border">
            <Image src="/logo.png" alt="Sylk AI" width={32} height={32} className="rounded-lg" />
            <div>
              <p className="text-gray-900 text-sm font-bold">Sylk AI</p>
              <p className="text-emerald-500 text-xs font-medium">Online</p>
            </div>
          </div>

          {/* Chat messages */}
          <div className="p-5 space-y-4 min-h-[180px]">
            <AnimatePresence mode="wait">
              {/* User message */}
              <motion.div
                key={`user-${activeIndex}`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="flex justify-end"
              >
                <div className="bg-primary text-white rounded-2xl rounded-br-md px-4 py-2.5 max-w-[85%]">
                  <p className="text-sm">{current.action}</p>
                </div>
              </motion.div>

              {/* AI response */}
              <motion.div
                key={`ai-${activeIndex}`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="flex justify-start"
              >
                <div className="bg-surface-2 rounded-2xl rounded-bl-md px-4 py-2.5 max-w-[85%]">
                  {showResponse ? (
                    <p className="text-sm text-gray-700">{current.result}</p>
                  ) : (
                    <TypingDots />
                  )}
                </div>
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Capability pills */}
          <div className="px-5 pb-5">
            <div className="flex flex-wrap gap-2">
              {AI_CAPABILITIES.map((cap, i) => (
                <button
                  key={i}
                  onClick={() => {
                    setActiveIndex(i);
                    setShowResponse(false);
                    setTimeout(() => setShowResponse(true), 1200);
                  }}
                  className={`text-[11px] font-medium px-3 py-1.5 rounded-full transition-colors ${
                    i === activeIndex
                      ? 'bg-primary text-white'
                      : 'bg-surface-2 text-text-secondary hover:bg-gray-200'
                  }`}
                >
                  {cap.action.replace(/"/g, '').substring(0, 25)}...
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </SectionWrapper>
  );
}
