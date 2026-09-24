import * as React from 'react';
import { cn } from '@/lib/utils';

export type SpinningBorderButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  showArrow?: boolean;
  surfaceClassName?: string;
};

export const SpinningBorderButton = React.forwardRef<HTMLButtonElement, SpinningBorderButtonProps>(
  function SpinningBorderButton({ children = 'Request Demo', className, surfaceClassName, showArrow = true, type = 'button', ...props }, ref) {
    return (
      <button ref={ref} type={type} data-slot="spinning-border-button"
        className={cn('group relative inline-flex items-center justify-center overflow-hidden rounded-full p-px transition-all duration-300 enabled:hover:-translate-y-0.5 enabled:hover:shadow-[0_0_25px_rgba(255,255,255,0.1)] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white motion-reduce:transform-none', className)}
        {...props}>
        <span aria-hidden="true" className="pointer-events-none absolute inset-[-100%] animate-[spin_3s_linear_infinite] bg-[conic-gradient(from_90deg_at_50%_50%,transparent_0%,transparent_75%,#ffffff_100%)] opacity-0 transition-opacity duration-300 group-enabled:group-hover:opacity-100 group-focus-visible:opacity-100 motion-reduce:animate-none" />
        <span aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-full bg-zinc-800 transition-opacity duration-300 group-enabled:group-hover:opacity-0 group-focus-visible:opacity-0" />
        <span className={cn('relative flex h-full w-full items-center justify-center gap-2 rounded-full bg-gradient-to-b from-zinc-800 to-zinc-950 px-6 py-2.5 text-xs font-medium uppercase tracking-widest text-zinc-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.3)] transition-colors duration-300 group-hover:text-white', surfaceClassName)}>
          <span className="relative z-10 inline-flex items-center justify-center gap-2">{children}</span>
          {showArrow && <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="relative z-10 shrink-0 transition-transform duration-300 group-hover:translate-x-0.5 motion-reduce:transform-none"><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>}
        </span>
      </button>
    );
  },
);

export default SpinningBorderButton;
