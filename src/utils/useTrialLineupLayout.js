import { useLayoutEffect, useState } from 'react';

const PHOTO_RATIO = 200 / 260;
const LABEL_PX = 32;
const GAP_PX = 10.5;

export function useMaxWidth(px) {
  const query = `(max-width: ${px}px)`;
  const [matches, setMatches] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia(query).matches;
  });

  useLayoutEffect(() => {
    const mq = window.matchMedia(query);
    const sync = () => setMatches(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, [query]);

  return matches;
}

/** Narrow layout: card width from row width; height from 200×260 (+ label). Page scrolls if needed. */
export function useTrialLineupLayout(stageRef, enabled) {
  const [layout, setLayout] = useState(null);

  useLayoutEffect(() => {
    if (!enabled) {
      setLayout(null);
      return undefined;
    }
    const el = stageRef.current;
    if (!el) return undefined;

    const measure = () => {
      const w = el.clientWidth;
      if (w <= 0) return;

      const cardW = Math.max(0, (w - GAP_PX) / 2);
      const photoH = cardW > 0 ? cardW / PHOTO_RATIO : 0;
      const cardH = LABEL_PX + photoH;

      setLayout({
        cardWidth: Math.floor(cardW),
        cardHeight: Math.floor(cardH),
      });
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [enabled, stageRef]);

  return layout;
}
