'use client';

import { ComponentType, ReactNode, useEffect, useState } from 'react';

export type LazyComponent<P> = ComponentType<P> & { preload: () => Promise<ComponentType<P>> };

/** 코드가 오기 전·실패 시 표시. 함수면 호출자의 props와 다시 받기(retry)를 받는다(닫기·다시 시도 버튼용). */
export type LazyPlaceholder<P> = ReactNode | ((props: P, retry: () => void) => ReactNode);

/**
 * Code-split component without Suspense: React's Suspense reveal throttle (~300ms per boundary) made chained
 * workspace → editor loads visibly slower than one eager bundle. Loaded code renders synchronously on later mounts.
 * A failed load shows `failed`; its `retry` (or the next mount) loads again. Never reloads the page: unsaved edits may exist.
 */
export function lazyComponent<P extends object>(
  load: () => Promise<ComponentType<P>>,
  fallback: LazyPlaceholder<P> = null,
  failed: LazyPlaceholder<P> = fallback,
): LazyComponent<P> {
  let loaded: ComponentType<P> | null = null;
  let pending: Promise<ComponentType<P>> | null = null;
  const preload = () => {
    pending ??= load().then(
      (component) => (loaded = component),
      (error: unknown) => { pending = null; throw error; },
    );
    return pending;
  };

  function Lazy(props: P) {
    const [Component, setComponent] = useState<ComponentType<P> | null>(() => loaded);
    const [attempt, setAttempt] = useState(0);
    const [error, setError] = useState(false);
    useEffect(() => {
      if (Component) return;
      let live = true;
      preload().then((component) => { if (live) setComponent(() => component); }, () => { if (live) setError(true); });
      return () => { live = false; };
    }, [Component, attempt]);
    if (Component) return <Component {...props} />;
    const retry = () => { setError(false); setAttempt((n) => n + 1); };
    const placeholder = error ? failed : fallback;
    return <>{typeof placeholder === 'function' ? placeholder(props, retry) : placeholder}</>;
  }
  return Object.assign(Lazy, { preload });
}
