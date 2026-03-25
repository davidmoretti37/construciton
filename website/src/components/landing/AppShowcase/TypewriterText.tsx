'use client';

import { useState, useEffect } from 'react';

export function useTypewriter(text: string, isActive: boolean, delay = 0, speed = 40) {
  const [displayed, setDisplayed] = useState('');

  useEffect(() => {
    if (!isActive) {
      setDisplayed('');
      return;
    }

    let timeout: NodeJS.Timeout;
    let charIndex = 0;

    const start = setTimeout(() => {
      const tick = () => {
        if (charIndex <= text.length) {
          setDisplayed(text.slice(0, charIndex));
          charIndex++;
          timeout = setTimeout(tick, speed);
        }
      };
      tick();
    }, delay);

    return () => {
      clearTimeout(start);
      clearTimeout(timeout);
    };
  }, [text, isActive, delay, speed]);

  return displayed;
}

export default function TypewriterText({
  text,
  isActive,
  delay = 0,
  speed = 40,
  className = '',
}: {
  text: string;
  isActive: boolean;
  delay?: number;
  speed?: number;
  className?: string;
}) {
  const displayed = useTypewriter(text, isActive, delay, speed);

  return (
    <span className={className}>
      {displayed}
      {isActive && displayed.length < text.length && (
        <span className="inline-block w-px h-[1em] bg-current animate-pulse ml-0.5" />
      )}
    </span>
  );
}
