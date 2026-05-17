import { useState, useEffect, useCallback } from 'react';

export function useLocalStorage<T>(key: string, initialValue: T) {
  const read = useCallback((): T => {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return initialValue;
      return JSON.parse(raw) as T;
    } catch (err) {
      console.warn('useLocalStorage read error for', key, err);
      return initialValue;
    }
  }, [key, initialValue]);

  const [state, setState] = useState<T>(read);

  useEffect(() => {
    setState(read());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const setValue = useCallback((val: T | ((prev: T) => T)) => {
    try {
      const newVal = typeof val === 'function' ? (val as (p: T) => T)(read()) : val;
      localStorage.setItem(key, JSON.stringify(newVal));
      setState(newVal);
    } catch (err) {
      console.error('useLocalStorage write error for', key, err);
    }
  }, [key, read]);

  return [state, setValue] as const;
}
