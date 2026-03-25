'use client';

import { motion } from 'framer-motion';

const SCENE_LABELS = ['Estimates', 'Projects', 'Services', 'Financials', 'AI Assistant'];

export default function ShowcaseNav({
  activeScene,
  onSceneClick,
}: {
  activeScene: number;
  onSceneClick: (index: number) => void;
}) {
  return (
    <>
      {/* Desktop: vertical right side */}
      <div className="hidden lg:flex flex-col items-end gap-3 absolute right-8 top-1/2 -translate-y-1/2 z-20">
        {SCENE_LABELS.map((label, i) => (
          <button
            key={label}
            onClick={() => onSceneClick(i)}
            className="flex items-center gap-3 group"
          >
            <span
              className={`text-xs font-medium transition-opacity duration-300 ${
                i === activeScene ? 'opacity-100 text-gray-900' : 'opacity-0 group-hover:opacity-70 text-text-muted'
              }`}
            >
              {label}
            </span>
            <div className="relative w-3 h-3 flex items-center justify-center">
              <span
                className={`block rounded-full transition-all duration-300 ${
                  i === activeScene
                    ? 'w-3 h-3 bg-primary'
                    : 'w-2 h-2 bg-gray-300 group-hover:bg-gray-400'
                }`}
              />
              {i === activeScene && (
                <motion.span
                  layoutId="active-dot"
                  className="absolute inset-0 rounded-full bg-primary/20"
                  initial={false}
                  transition={{ type: 'spring', damping: 20, stiffness: 300 }}
                  style={{ scale: 2 }}
                />
              )}
            </div>
          </button>
        ))}
      </div>

      {/* Mobile: horizontal bottom */}
      <div className="flex lg:hidden items-center justify-center gap-2 absolute bottom-6 left-1/2 -translate-x-1/2 z-20">
        {SCENE_LABELS.map((label, i) => (
          <button
            key={label}
            onClick={() => onSceneClick(i)}
            className="relative w-3 h-3 flex items-center justify-center"
          >
            <span
              className={`block rounded-full transition-all duration-300 ${
                i === activeScene
                  ? 'w-3 h-3 bg-primary'
                  : 'w-2 h-2 bg-gray-300'
              }`}
            />
          </button>
        ))}
      </div>
    </>
  );
}
