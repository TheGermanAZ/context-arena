import { useEffect, useRef, useState } from 'react';

interface Props {
  value: number;
  duration?: number;
  format?: (n: number) => string;
  className?: string;
}

export default function AnimatedNumber({ value, duration = 1200, format, className }: Props) {
  const [display, setDisplay] = useState(0);
  const rafId = useRef<number>(0);
  const startRef = useRef<{ time: number; value: number } | null>(null);

  useEffect(() => {
    const startValue = display;
    startRef.current = null;

    const animate = (timestamp: number) => {
      if (!startRef.current) startRef.current = { time: timestamp, value: startValue };
      const elapsed = timestamp - startRef.current.time;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(startRef.current.value + (value - startRef.current.value) * eased);
      if (progress < 1) rafId.current = requestAnimationFrame(animate);
    };

    rafId.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafId.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, duration]);

  const formatted = format ? format(display) : Math.round(display).toLocaleString();
  return <span className={className}>{formatted}</span>;
}
