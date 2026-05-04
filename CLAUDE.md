# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — start Next.js dev server (http://localhost:3000)
- `npm run build` — production build
- `npm run start` — run the built app
- `npm run lint` — ESLint via `next lint` (extends `next/core-web-vitals`)

There is no test setup in this repo. Node 20+ is recommended.

## Stack

Next.js 16 (App Router) + React 19 + TypeScript 6 (strict). Path alias `@/*` → repo root. Plain CSS only — no Tailwind, no CSS-in-JS, no UI library.

## Architecture

This is a **single-page mobile-first event signup site** ("로테이션 소개팅" / Rotation Dating). All UI is in Korean. Despite using the App Router, there is only one route (`app/page.tsx`); navigation between the three screens is **state-based, not URL-based**.

### Screen flow

`app/page.tsx` wraps `<App />` in `<Suspense>` (required because `App` calls `useSearchParams`). `app/components/App.tsx` holds a `Route = 'landing' | 'form' | 'success'` in `useState` and renders one of:

- `Landing` → `FormFlow` → `Success`

There is no router, no back-button history, and no persistence — refreshing returns the user to landing and discards all form data.

### Hero variants

`Landing` reads `?hero=default|centered|minimal` from the URL and renders one of three hero layouts (`HeroPoster`, `HeroCentered`, `HeroMinimal`) defined in the same file. The `HeroVariant` union and `HERO_VARIANTS` allow-list in `App.tsx` are the source of truth — adding a variant requires updating both.

### Form flow (`FormFlow.tsx` + `steps.tsx`)

8 sequential steps driven by a numeric `step` index, not routes. Key conventions:

- **Single `FormData` object** in `FormFlow` state; each step receives `{ data, update, errors, shakeKey }` via `StepProps`. `update` shallow-merges a patch.
- **Step registry**: `STEP_COMPONENTS: Record<number, ComponentType<StepProps>>` in `steps.tsx` maps step number → component. Adding a step means adding to this map *and* bumping `TOTAL_STEPS` in `FormFlow.tsx` *and* adding a validation branch in `validateStep`.
- **Validation lives in `FormFlow.validateStep(s)`**, not inside step components. Step components are display-only; they don't gate navigation.
- **Shake-on-error pattern**: `handleNext` increments `shakeKey` when validation fails. `ShakeWrap` watches the key change and re-triggers a CSS shake animation by toggling the `shaking` class with a forced reflow (`void el.offsetWidth`). Individual fields (e.g. `WheelPicker`) also re-key themselves on `shakeKey` to re-trigger their own shake.
- **Slide direction**: `direction` (`'forward' | 'backward'`) drives the `step-slide--forward` / `step-slide--backward` CSS classes for the transition animation.
- **Photos are not uploaded.** `Step4` reads files via `FileReader.readAsDataURL` and stores base64 strings in `FormData.photoFace/photoBody/photoId`. There is no backend; submitting just transitions to `Success`.
- **`idealType` is a derived field**: `Step5` keeps an `idealTagsArr` (chip selection, max 5) and `idealTypeNote` (free text), and writes the joined string into `idealType` whenever either changes. If you read or write `idealType` directly elsewhere, keep this contract intact.

### Styling

Tokens-first CSS, all global. Import chain: components reference class names → `app/globals.css` → `app/styles.css` → `app/colors_and_type.css` (design tokens as CSS custom properties: `--coral`, `--ink`, `--fs-h1`, etc.). Pretendard is loaded from a CDN inside `colors_and_type.css`.

The whole app renders inside a `.page-letterbox` → `.frame` shell (mobile-max width centered on desktop, full-width below 600px). Don't add page-level layout outside this shell.

`<img>` tags use raw `<img src="/assets/..." />` with `eslint-disable-next-line @next/next/no-img-element` rather than `next/image` — keep that pattern unless explicitly migrating.

### MBTI color coding

`mbtiColor()` in `steps.tsx` maps MBTI codes to four brand colors based on letter positions (NT → ink, NF → coral, SJ → mint, else → warning). It's used both for the code text color and the selected-card border.

## Branching

All work happens on `main`. A `dev` branch exists but is unused per the README.
