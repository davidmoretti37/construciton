'use client';

import { useRef, useState, useCallback } from 'react';
import { useScroll, useTransform, useMotionValueEvent } from 'framer-motion';
import SceneEstimates from './SceneEstimates';
import SceneProjects from './SceneProjects';
import SceneServicePlans from './SceneServicePlans';
import SceneFinancials from './SceneFinancials';
import SceneAI from './SceneAI';
import ShowcaseNav from './ShowcaseNav';

const SCENES = [
  { key: 'estimates', component: SceneEstimates },
  { key: 'projects', component: SceneProjects },
  { key: 'services', component: SceneServicePlans },
  { key: 'financials', component: SceneFinancials },
  { key: 'ai', component: SceneAI },
] as const;

const SCENE_COUNT = SCENES.length;

export default function AppShowcase() {
  const outerRef = useRef<HTMLDivElement>(null);
  const [activeScene, setActiveScene] = useState(0);
  const [hasEntered, setHasEntered] = useState(false);

  const { scrollYProgress } = useScroll({
    target: outerRef,
    offset: ['start start', 'end end'],
  });

  // Give each scene equal scroll room with padding at start/end
  // 0-10% = first scene holds, then transitions evenly, 90-100% = last scene holds
  const sceneProgress = useTransform(
    scrollYProgress,
    [0.05, 0.95],
    [0, SCENE_COUNT - 1]
  );

  useMotionValueEvent(sceneProgress, 'change', (latest) => {
    const rounded = Math.round(Math.max(0, Math.min(SCENE_COUNT - 1, latest)));
    if (rounded !== activeScene) {
      setActiveScene(rounded);
    }
    if (!hasEntered && latest >= 0) {
      setHasEntered(true);
    }
  });

  const handleSceneClick = useCallback((index: number) => {
    if (!outerRef.current) return;
    const totalHeight = outerRef.current.offsetHeight;
    // Map scene index back to scroll position (inverse of the 0.05-0.95 range)
    const progress = 0.05 + (index / (SCENE_COUNT - 1)) * 0.9;
    const scrollOffset = progress * (totalHeight - window.innerHeight);
    const targetY = outerRef.current.offsetTop + scrollOffset;
    window.scrollTo({ top: targetY, behavior: 'smooth' });
  }, []);

  return (
    <section
      ref={outerRef}
      className="relative bg-gradient-to-b from-gray-50 via-blue-50/30 to-gray-50"
      style={{ height: `${SCENE_COUNT * 100}dvh` }}
    >
      {/* Sticky container */}
      <div className="sticky top-0 h-screen flex items-center justify-center overflow-hidden">
        {/* Section header — always visible */}
        <div
          className="absolute top-8 left-1/2 -translate-x-1/2 text-center z-20 transition-opacity duration-500"
          style={{ opacity: hasEntered ? 1 : 0 }}
        >
          <p className="text-primary text-xs font-semibold tracking-widest uppercase mb-1">
            Experience Sylk
          </p>
          <p className="text-text-muted text-xs">
            Scroll to explore
          </p>
        </div>

        {/* Scene content */}
        <div className="w-full">
          {SCENES.map((scene, i) => {
            const Scene = scene.component;
            const isActive = activeScene === i;
            return (
              <div
                key={scene.key}
                className="absolute inset-0 flex items-center justify-center transition-opacity duration-300 ease-out"
                style={{
                  opacity: isActive ? 1 : 0,
                  pointerEvents: isActive ? 'auto' : 'none',
                }}
              >
                <Scene isActive={isActive} />
              </div>
            );
          })}
        </div>

        {/* Navigation dots */}
        {hasEntered && (
          <ShowcaseNav activeScene={activeScene} onSceneClick={handleSceneClick} />
        )}
      </div>
    </section>
  );
}
