# Starfield interface theme

The active frontend is this `frontend/` folder. React, TypeScript and Tailwind CSS 4 were already configured. The integration adds `motion`, `tw-animate-css`, the shadcn configuration, and the `@/` alias in both Vite and TypeScript.

## Paths

- Shared UI: `src/components/ui/`
- Global styles and theme tokens: `src/index.css`
- Class merging: `src/lib/utils.ts`
- shadcn configuration: `components.json`

In this Vite project, `@/components/ui` resolves to `src/components/ui`, not a second folder at the repository root. Keep reusable components here so imports in shadcn examples work and the CLI places new components consistently. Feature components remain in `src/components/layout`, `sensors`, `fusion`, and `radar`.

## Install and run

```sh
cd frontend
npm install
npm run dev
npm run build
npm run lint
```

The project is already configured; no reinitialization is needed. For a new Vite app, use `npx shadcn@latest init -d --template vite`. For an existing, unconfigured React/TypeScript app, install `tailwindcss @tailwindcss/vite`, register the Vite plugin, import `tailwindcss` in the entry CSS, configure `@/*` in TypeScript and Vite, then run `npx shadcn@latest init -d`. TypeScript projects also need `typescript @types/react @types/react-dom` as development dependencies. See the [official Vite installation guide](https://ui.shadcn.com/docs/installation/vite).

Add future shadcn components from this folder with `npx shadcn@latest add <component>`.

## Components

```tsx
import { StarsBackground } from '@/components/ui/stars';
import { SpinningBorderButton } from '@/components/ui/spinning-border-button';

export function Demo() {
  return (
    <StarsBackground className="flex h-dvh items-center justify-center"
      speed={50} factor={0.05} starColor="#ffffff"
      transition={{ stiffness: 50, damping: 20 }}>
      <SpinningBorderButton>Request Demo</SpinningBorderButton>
    </StarsBackground>
  );
}
```

The background mounts once in `App.tsx`, behind every route. Decorative layers ignore pointer events; mouse coordinates are relative to their container and reset on exit. Stars are generated after mount, and reduced-motion preferences disable parallax and drift.

Buttons forward native props and refs. The default type is `button`; use `type="submit"` explicitly for forms. `showArrow={false}` supports compact controls, and `surfaceClassName` customizes content spacing without disturbing the border.

Existing cards use `theme-card` for charcoal gradients and the rotating white border on hover or keyboard focus. Existing native controls use `theme-control` for the same border treatment while retaining status colors and layout. The beam uses a masked pseudo-element, requires no wrapper, and cannot intercept clicks. Add these classes explicitly to new surfaces. Keep red, amber, and green indicators for operational status.

The sidebar collapses to labelled icons on narrower screens. The header wraps, page backgrounds remain transparent, and card grids can shrink. Reduced-motion preferences also disable the CSS border animation.

## Verification

- Production build and TypeScript compilation pass. Vite reports a large-bundle advisory.
- Project lint exits successfully with existing warnings; the new UI components and utility pass focused lint without warnings.
- All eleven routes rendered at a 390 × 844 viewport without horizontal overflow in the available data state. Desktop dashboard and settings layouts were inspected as well.
- Hover and keyboard-focus beams were checked in the browser, along with non-intercepting star layers and header alignment after resizing.
- The local backend and physical camera were verified with the existing best.pt YOLO model, real snapshot retrieval, and camera off/reconnect. Non-camera sensor and dispatch features remain simulations.

## Light and dark themes

`src/lib/theme.ts` applies the saved `rescue-ai-theme` preference before React renders. `src/components/ui/theme-toggle.tsx` exposes the header toggle. Light and dark tokens cover cards, stars, controls, charts, navigation and map surfaces. The original transparent logo is served from `public/rescue-ai-logo.png` with theme-specific CSS brightness. Theme choice persists after reload.
