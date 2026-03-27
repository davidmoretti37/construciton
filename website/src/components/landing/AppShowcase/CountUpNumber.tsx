'use client';

import { useState, useEffect } from 'react';

export default function CountUpNumber({
  value,
  isActive,
  delay = 0,
  duration = 1200,
  prefix = '',
  suffix = '',
  decimals = 0,
  className = '',
}: {
  value: number;
  isActive: boolean;
  delay?: number;
  duration?: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  className?: string;
}) {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (!isActive) return;

    let raf: number;
    const startTimeout = setTimeout(() => {
      const startTime = Date.now();
      const tick = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        setDisplay(value * eased);
        if (progress < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }, delay);

    return () => {
      clearTimeout(startTimeout);
      cancelAnimationFrame(raf);
      setDisplay(0);
    };
  }, [value, isActive, delay, duration]);

  return (
    <span className={className}>
      {prefix}
      {decimals > 0 ? display.toFixed(decimals) : Math.round(display).toLocaleString()}
      {suffix}
    </span>
  );
}
