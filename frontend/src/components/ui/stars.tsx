"use client";

import * as React from 'react';
import {
  type HTMLMotionProps, motion, type SpringOptions, type Transition,
  useMotionValue, useReducedMotion, useSpring,
} from 'motion/react';
import { cn } from '@/lib/utils';

type StarLayerProps = HTMLMotionProps<'div'> & {
  count: number;
  size: number;
  transition: Transition;
  starColor: string;
  reducedMotion: boolean;
};

function generateStars(count: number, starColor: string) {
  return Array.from({ length: count }, () => {
    const x = Math.floor(Math.random() * 4000) - 2000;
    // A full positive-height tile keeps the duplicated layer seamless.
    const y = Math.floor(Math.random() * 2000);
    return `${x}px ${y}px ${starColor}`;
  }).join(', ');
}

const StarLayer = React.memo(function StarLayer({
  count, size, transition, starColor, reducedMotion, className, ...props
}: StarLayerProps) {
  const [boxShadow, setBoxShadow] = React.useState('');
  React.useEffect(() => {
    // Generate only after mount, keeping server/client markup identical.
    const frame = requestAnimationFrame(() => setBoxShadow(generateStars(count, starColor)));
    return () => cancelAnimationFrame(frame);
  }, [count, starColor]);
  const style = { width: size, height: size, boxShadow };
  return (
    <motion.div
      data-slot="star-layer"
      animate={{ y: reducedMotion ? 0 : [0, -2000] }}
      transition={reducedMotion ? { duration: 0 } : transition}
      className={cn('absolute left-1/2 top-0 h-[2000px] w-full', className)}
      {...props}
    >
      <div className="absolute rounded-full bg-transparent" style={style} />
      <div className="absolute top-[2000px] rounded-full bg-transparent" style={style} />
    </motion.div>
  );
});

export type StarsBackgroundProps = React.ComponentProps<'div'> & {
  factor?: number;
  speed?: number;
  transition?: SpringOptions;
  starColor?: string;
};

const defaultSpring = { stiffness: 50, damping: 20 };

export function StarsBackground({
  children, className, factor = 0.05, speed = 50,
  transition = defaultSpring, starColor = '#fff', onMouseMove, onMouseLeave, ...props
}: StarsBackgroundProps) {
  const offsetX = useMotionValue(0);
  const offsetY = useMotionValue(0);
  const springX = useSpring(offsetX, transition);
  const springY = useSpring(offsetY, transition);
  const reducedMotion = useReducedMotion() ?? false;
  const duration = Number.isFinite(speed) ? Math.max(1, speed) : 50;

  const handleMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    onMouseMove?.(event);
    if (reducedMotion || event.defaultPrevented) return;
    const rect = event.currentTarget.getBoundingClientRect();
    offsetX.set(-(event.clientX - rect.left - rect.width / 2) * factor);
    offsetY.set(-(event.clientY - rect.top - rect.height / 2) * factor);
  };

  return (
    <div
      {...props}
      data-slot="stars-background"
      className={cn('relative isolate size-full overflow-clip bg-[radial-gradient(ellipse_at_bottom,_#262626_0%,_#000_100%)]', className)}
      onMouseMove={handleMouseMove}
      onMouseLeave={(event) => { offsetX.set(0); offsetY.set(0); onMouseLeave?.(event); }}
    >
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <motion.div
          className="absolute inset-0"
          style={{ x: reducedMotion ? 0 : springX, y: reducedMotion ? 0 : springY }}
        >
          {[{ count: 1000, size: 1 }, { count: 400, size: 2 }, { count: 200, size: 3 }].map((layer) => (
            <StarLayer key={layer.size} {...layer} starColor={starColor} reducedMotion={reducedMotion}
              transition={{ repeat: Infinity, duration: duration * layer.size, ease: 'linear' }} />
          ))}
        </motion.div>
      </div>
      {children}
    </div>
  );
}

export default StarsBackground;
