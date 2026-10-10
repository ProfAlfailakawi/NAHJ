/*
 * Journey reveal — plays a stepper's intro ONCE when it scrolls into view.
 *
 * Truth rule: the steps' real `state` is never changed by this hook. It only
 * says how many of the already-true lit stations (`target`) are shown so far;
 * the rest are drawn as pending until their turn. Once the intro ends (or when
 * it cannot / should not run) `lit` is null and the real states are rendered.
 */
import * as React from 'react';

/** Entities whose intro already played in this tab: a remount must not replay it. */
const played = new Set<string>();

const STORE = 'nahj:journey-played';

function wasPlayed(key: string | undefined): boolean {
  if (!key) return false;
  if (played.has(key)) return true;
  try {
    const raw = window.sessionStorage.getItem(STORE);
    if (raw && (JSON.parse(raw) as string[]).includes(key)) {
      played.add(key);
      return true;
    }
  } catch {
    /* storage may be blocked: the in-memory set still applies */
  }
  return false;
}

function remember(key: string | undefined) {
  if (!key) return;
  played.add(key);
  try {
    window.sessionStorage.setItem(STORE, JSON.stringify([...played].slice(-200)));
  } catch {
    /* ignore */
  }
}

/** ~4s in total whatever the station count, between 350ms and 750ms a station. */
export const journeyStepMs = (count: number) => Math.min(750, Math.max(350, Math.round(4000 / Math.max(1, count))));

export interface JourneyRevealOptions {
  /** How many stations are really lit (index of the last done/current step + 1). */
  target: number;
  /** Total station count (only used to derive the pace). */
  count: number;
  stepMs?: number;
  threshold?: number;
  enabled?: boolean;
  /** Wait (stay at 0 lit) until the host says it is ready, e.g. while a panel is still loading. */
  hold?: boolean;
  /** Same key => the intro is not replayed for that entity during this tab session. */
  playKey?: string;
  /** Called when this stepper is finished with its intro, or has none to play (so another one can start). */
  onDone?: () => void;
}

export function useJourneyReveal<T extends HTMLElement = HTMLOListElement>({
  target,
  count,
  stepMs,
  threshold = 0.5,
  enabled = true,
  hold = false,
  playKey,
  onDone,
}: JourneyRevealOptions) {
  const ref = React.useRef<T>(null);
  const [lit, setLit] = React.useState<number | null>(null);
  const targetRef = React.useRef(target);
  targetRef.current = target;
  const doneRef = React.useRef(onDone);
  doneRef.current = onDone;
  const armedFor = React.useRef<string | null>(null);
  const hasTarget = target > 0;
  const pace = stepMs ?? journeyStepMs(count);

  React.useLayoutEffect(() => {
    setLit(null);
    const node = ref.current;
    const skip = () => doneRef.current?.();
    if (!enabled || !node || typeof IntersectionObserver === 'undefined') return skip();
    if (typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return skip();
    if (wasPlayed(playKey)) return skip();
    // Nothing is lit yet (data still loading): do not arm, and do not spend the play. The effect runs again
    // when the first real station appears (hasTarget is a dependency).
    if (!hasTarget) return skip();
    // Play once per mount / key, whatever re-runs the effect (hold released, data refreshed).
    const token = playKey ?? '';
    if (armedFor.current === token) return;
    // An element that cannot be measured, or one taller than the viewport, would never reach a fixed ratio:
    // never hide the real state behind an unreachable threshold.
    const box = node.getBoundingClientRect();
    if (!box.height || !box.width) return skip();
    const reachable = Math.max(0.05, Math.min(threshold, (0.9 * window.innerHeight) / box.height));

    let timer: ReturnType<typeof setTimeout> | undefined;
    let done = false;
    setLit(0);
    if (hold) {
      // Waiting for another stepper: stay unlit, but never for ever (e.g. it is scrolled out of view).
      const giveUp = setTimeout(() => {
        armedFor.current = token;
        setLit(null);
      }, 8000);
      return () => clearTimeout(giveUp);
    }
    armedFor.current = token;
    const tick = (n: number) => {
      // The real stage may have been reached (or lost) while we were playing: never overshoot it.
      // `target` is re-read on every tick, so a stage that moves mid-intro is followed and the ticker always
      // ends in the settle below; it is only stopped by the effect cleanup, which settles as well.
      const max = targetRef.current;
      if (n > max) {
        setLit(null);
        remember(playKey);
        done = true;
        doneRef.current?.();
        return;
      }
      setLit(n);
      timer = setTimeout(() => tick(n + 1), pace);
    };
    const io = new IntersectionObserver(
      entries => {
        // isIntersecting is true with a single pixel visible: require the real (attainable) ratio.
        if (!entries.some(e => e.isIntersecting && e.intersectionRatio >= reachable - 0.01)) return;
        io.disconnect();
        timer = setTimeout(() => tick(1), 250);
      },
      { threshold: reachable },
    );
    io.observe(node);
    return () => {
      io.disconnect();
      if (timer) clearTimeout(timer);
      // A cleanup before the intro finished (unmount, key change) leaves the real state in place.
      if (!done) setLit(null);
    };
    // `target` is read through a ref on purpose: live data must not restart the intro.
  }, [enabled, hold, hasTarget, playKey, pace, threshold]);

  return { ref, lit };
}
