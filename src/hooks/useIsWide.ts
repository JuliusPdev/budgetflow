import { useEffect, useState } from 'react';

/**
 * Whether the window is at least `minWidthPx` wide, kept up to date while the
 * window is resized. Used to pick the ledger layout automatically.
 */
export function useIsWide(minWidthPx = 900): boolean {
  const query = `(min-width: ${minWidthPx}px)`;
  const [isWide, setIsWide] = useState(() => window.matchMedia(query).matches);

  useEffect(() => {
    const media = window.matchMedia(query);
    function handleChange() {
      setIsWide(media.matches);
    }
    media.addEventListener('change', handleChange);
    // Stop listening when the component leaves the screen.
    return () => media.removeEventListener('change', handleChange);
  }, [query]);

  return isWide;
}
