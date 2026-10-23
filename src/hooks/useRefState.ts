import { useCallback, useRef, useState, MutableRefObject } from 'react';

type Updater<T> = T | ((prev: T) => T);

/**
 * useState whose latest value is also mirrored synchronously into a ref.
 * Async code (save queue, event handlers) reads `ref.current` and always sees the newest value,
 * even before React re-renders. Updates must go through the returned `update` function.
 */
export function useRefState<T>(
  init: () => T,
): [T, (next: Updater<T>) => void, MutableRefObject<T>] {
  const [state, setState] = useState<T>(init);
  const ref = useRef<T>(state);

  const update = useCallback((next: Updater<T>) => {
    const value = typeof next === 'function' ? (next as (prev: T) => T)(ref.current) : next;
    ref.current = value;
    setState(value);
  }, []);

  return [state, update, ref];
}
