'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ChatBubbleLeftRightIcon, LightBulbIcon, BoltIcon } from '@heroicons/react/24/outline';
import { SparklesIcon } from '@heroicons/react/24/solid';
import { useTypewriter } from './TypewriterText';

const bullets = [
  { icon: ChatBubbleLeftRightIcon, title: 'Just say what you need', desc: 'Voice or text in EN, ES, PT' },
  { icon: LightBulbIcon, title: 'AI that knows your business', desc: '60 tools with long-term memory' },
  { icon: BoltIcon, title: 'Actions, not just answers', desc: 'Creates, assigns, tracks, and invoices' },
];

function TypingDots() {
  return (
    <div className="flex gap-1 items-center h-4">
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

const AI_RESPONSE = "Done! I've created estimate #EST-2024-042 for John's kitchen remodel. Total: $12,450. Want me to send it to him?";

export default function SceneAI({ isActive }: { isActive: boolean }) {
  const [showTyping, setShowTyping] = useState(false);
  const [showResponse, setShowResponse] = useState(false);

  const aiText = useTypewriter(AI_RESPONSE, showResponse, 0, 25);

  useEffect(() => {
    if (!isActive) {
      setShowTyping(false);
      setShowResponse(false);
      return;
    }

    const typingTimer = setTimeout(() => setShowTyping(true), 1400);
    const responseTimer = setTimeout(() => {
      setShowTyping(false);
      setShowResponse(true);
    }, 2800);

    return () => {
      clearTimeout(typingTimer);
      clearTimeout(responseTimer);
    };
  }, [isActive]);

  return (
    <div className="flex flex-col lg:flex-row-reverse items-center gap-6 lg:gap-16 w-full max-w-6xl mx-auto px-6">
      {/* Right: Text */}
      <div className="flex-1 text-center lg:text-left">
        <motion.p
          initial={{ opacity: 0 }}
          animate={isActive ? { opacity: 1 } : { opacity: 0 }}
          transition={{ duration: 0.4 }}
          className="text-violet-600 text-sm font-semibold tracking-wider uppercase mb-3"
        >
          AI Assistant
        </motion.p>
        <motion.h3
          initial={{ opacity: 0, y: 20 }}
          animate={isActive ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
          transition={{ type: 'spring', damping: 15, stiffness: 100 }}
          className="text-2xl sm:text-3xl lg:text-5xl font-extrabold text-gray-900 mb-5 leading-tight"
        >
          Your Business.{' '}
          <span className="bg-gradient-to-r from-violet-500 to-blue-500 bg-clip-text text-transparent">
            Voice Activated.
          </span>
        </motion.h3>
        <motion.p
          initial={{ opacity: 0, y: 15 }}
          animate={isActive ? { opacity: 1, y: 0 } : { opacity: 0, y: 15 }}
          transition={{ duration: 0.5, delay: 0.15 }}
          className="text-text-secondary text-base leading-relaxed mb-8 max-w-md mx-auto lg:mx-0"
        >
          Foreman is your AI operations partner — 60 specialized tools, intent-based routing, and memory that learns your business.
        </motion.p>

        <div className="space-y-4">
          {bullets.map((b, i) => (
            <motion.div
              key={b.title}
              initial={{ opacity: 0, x: -20 }}
              animate={isActive ? { opacity: 1, x: 0 } : { opacity: 0, x: -20 }}
              transition={{ duration: 0.4, delay: 5.0 + i * 0.15 }}
              className="flex items-start gap-3 text-left"
            >
              <div className="w-9 h-9 rounded-lg bg-violet-50 flex items-center justify-center shrink-0 mt-0.5">
                <b.icon className="w-4 h-4 text-violet-600" />
              </div>
              <div>
                <p className="text-gray-900 text-sm font-medium">{b.title}</p>
                <p className="text-text-muted text-xs">{b.desc}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Left: Chat mockup */}
      <div className="flex-1 flex justify-center">
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={isActive ? { opacity: 1, y: 0 } : { opacity: 0, y: 40 }}
          transition={{ type: 'spring', damping: 20, stiffness: 80, delay: 0.2 }}
          className="w-full max-w-[320px] sm:max-w-[360px] relative"
        >
          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-xl">
            {/* Chat header */}
            <div className="flex items-center gap-3 px-5 py-3.5 border-b border-gray-100">
              <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
                <SparklesIcon className="w-4 h-4 text-primary" />
              </div>
              <div>
                <p className="text-gray-900 text-sm font-bold">Foreman AI</p>
                <p className="text-emerald-500 text-[10px] font-medium">Online</p>
              </div>
            </div>

            {/* Chat messages */}
            <div className="p-5 space-y-3 min-h-[200px]">
              {/* User message */}
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={isActive ? { opacity: 1, x: 0 } : { opacity: 0, x: 20 }}
                transition={{ duration: 0.4, delay: 0.6 }}
                className="flex justify-end"
              >
                <div className="bg-primary text-white rounded-2xl rounded-br-md px-4 py-2.5 max-w-[85%]">
                  <p className="text-xs">Create an estimate for John&apos;s kitchen remodel</p>
                </div>
              </motion.div>

              {/* AI response */}
              <div className="flex justify-start">
                <div className="bg-gray-50 border border-gray-100 rounded-2xl rounded-bl-md px-4 py-2.5 max-w-[85%]">
                  {showTyping && !showResponse && <TypingDots />}
                  {showResponse && (
                    <p className="text-xs text-gray-700 leading-relaxed">
                      {aiText}
                      {aiText.length < AI_RESPONSE.length && (
                        <span className="inline-block w-px h-[1em] bg-gray-400 animate-pulse ml-0.5" />
                      )}
                    </p>
                  )}
                  {!showTyping && !showResponse && <div className="h-4" />}
                </div>
              </div>
            </div>

            {/* Input hint */}
            <div className="px-5 pb-4">
              <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5">
                <span className="text-text-muted text-[10px]">Type or speak your request...</span>
                <div className="ml-auto w-5 h-5 rounded-full bg-blue-50 flex items-center justify-center">
                  <svg className="w-2.5 h-2.5 text-primary" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z" />
                  </svg>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
