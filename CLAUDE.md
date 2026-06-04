# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

A **single-file Framer code component** (`Theater_Video_Player.tsx`, ~1100 lines). The file is not built locally — it is copy-pasted by the owner into Framer's code editor, which compiles it in the Framer environment. Treat this repository as a versioned source-of-truth for that snippet, not as a buildable application.

There is no `package.json`, no `node_modules`, no test runner, and no lint config. There are no commands to run. All "tooling" is the Framer canvas itself.

## How changes reach production

1. Edit `Theater_Video_Player.tsx` locally (VS Code).
2. Commit + push via GitHub Desktop. The owner is a designer; prefer GUI workflows over terminal Git unless asked.
3. Owner copies the file contents into the Framer code-component editor by hand.

The file must therefore remain **self-contained** — no relative imports, no separate modules. Everything (icons, helpers, hooks, constants, the component, the property controls) lives in this one file. Imports are limited to `react` and `framer`.

## Architecture

The file is organized top-to-bottom in this order, and changes should preserve that layout:

1. **JSDoc header** describing the component.
2. **Imports** — `react` and `framer` only.
3. **`Props` interface** — every prop that the component accepts. Must stay in sync with the `addPropertyControls(...)` block at the bottom.
4. **Pure helpers** — `formatTime`, icon components, `rectToFixedStyle`, `getTheaterStyle`, `prefersReducedMotion`, etc.
5. **Constants** — animation timings, sizing defaults, breakpoints (`THEATER_*`, `PROGRESS_*`, `MOBILE_NATIVE_FULLSCREEN_MAX_WIDTH`).
6. **`ControlBtn`** — reusable icon button used by the controls row.
7. **`useTheaterMode` hook** — owns the theater open/close transitions, Escape-to-close listener, rAF-throttled resize handler, and native mobile-fullscreen fallback. The main component is intentionally kept thin by delegating this state machine here.
8. **`TheaterVideoPlayer` default export** — the component itself. Includes the Framer magic JSDoc directives (`@framerSupportedLayoutWidth`, `@framerSupportedLayoutHeight`, `@framerIntrinsicWidth`, `@framerIntrinsicHeight`) that control how Framer sizes the component on the canvas. These comments are load-bearing — do not remove or reformat them.
9. **`addPropertyControls(TheaterVideoPlayer, { ... })`** — the property-panel schema. Every field here must match a key in `Props`.

## Things that are easy to break

- **Style merge order in the root `<div>`**: `style` (Framer-injected) → `theaterStyle` (theater overrides) → visual props (`borderRadius`, `border`, `background`, etc.). The last block must win so user-controlled visuals always override Framer's injected geometry. Reordering these spreads will silently break the glass frame look.
- **`addPropertyControls` ↔ `Props` sync**: adding a prop without a matching control entry (or vice versa) is the most common cause of "the property doesn't appear in Framer" bugs. Update both together.
- **`objectFit` in theater mode**: theater mode hard-codes `"contain"` regardless of the user's `objectFit` setting. This is intentional — letterboxing in theater mode is the desired behavior. The user-facing copy in the property panel documents this.
- **Pointer-capture cleanup**: the progress slider uses `setPointerCapture` / `releasePointerCapture`. Both pointer-up and pointer-cancel must release the capture and clear `isScrubbingRef`, otherwise scrubbing stays stuck after the user lifts the cursor outside the bar.
- **Native fullscreen cleanup**: `useTheaterMode`'s `nativeFsCleanup` ref must be invoked on unmount and when leaving fullscreen via either the `fullscreenchange` (Chrome/Firefox/desktop Safari) or `webkitendfullscreen` (iOS) event. Skipping one will leave the native `controls` attribute on after exit.

## Coding conventions

- **No semicolons** at the end of statements. Match the existing style.
- **4-space indentation.**
- **Inline styles only** — `CSSProperties` objects passed via the `style` prop. No CSS files, no styled-components, no Tailwind. Framer expects this.
- Use `useCallback` / `useMemo` for handlers and style objects that are passed down or used as effect dependencies — the existing code does this deliberately to keep reference identity stable.

## Owner context

The owner of this repo is a designer who is new to Git. Prefer:
- Explaining "why" before "what" when proposing changes.
- GitHub Desktop (GUI) over terminal Git commands.
- Figma analogies when explaining version-control concepts.
- Concise commit messages in English describing the user-visible change (e.g. `Refactor: extract theater mode into useTheaterMode hook`).
