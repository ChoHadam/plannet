import 'server-only';

/**
 * AI 호출 사용 제한 (프로세스 메모리 기반).
 *
 * 적용 범위:
 * - 사용자별 분당·일일 호출 수, 사용자별 동시 요청 1건
 * - 서버 프로세스 전체 일일 호출 수 (비용 상한)
 *
 * 한계:
 * - 카운터는 이 Node 프로세스 메모리에만 있다. 재시작하면 0으로 돌아간다.
 * - replica가 N개면 각자 따로 센다. 실제 허용량은 최대 N배가 된다.
 * - 일일 창은 첫 호출 시점부터 24시간 고정 창이다 (자정 기준 아님).
 * 다중 replica·지속 한도가 필요하면 Redis 등 공유 저장소로 옮겨야 한다.
 */

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;
const PRUNE_THRESHOLD = 10_000;

const DEFAULT_LIMITS = {
  perUserPerMinute: 5,
  perUserPerDay: 50,
  globalPerDay: 500,
} as const;

export interface AiUsageLimits {
  perUserPerMinute: number;
  perUserPerDay: number;
  globalPerDay: number;
}

function readLimit(name: string, fallback: number): number {
  const parsed = Number.parseInt(process.env[name] ?? '', 10);
  // 잘못된 값은 무제한이 아니라 기본값으로 떨어진다.
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function getAiUsageLimits(): AiUsageLimits {
  return {
    perUserPerMinute: readLimit('AI_RATE_LIMIT_PER_MINUTE', DEFAULT_LIMITS.perUserPerMinute),
    perUserPerDay: readLimit('AI_RATE_LIMIT_PER_DAY', DEFAULT_LIMITS.perUserPerDay),
    globalPerDay: readLimit('AI_GLOBAL_LIMIT_PER_DAY', DEFAULT_LIMITS.globalPerDay),
  };
}

interface WindowEntry {
  count: number;
  resetAt: number;
}

class FixedWindowCounter {
  private readonly entries = new Map<string, WindowEntry>();

  constructor(private readonly windowMs: number) {}

  private current(key: string, now: number): WindowEntry | undefined {
    const entry = this.entries.get(key);
    if (entry && entry.resetAt <= now) {
      this.entries.delete(key);
      return undefined;
    }
    return entry;
  }

  /** 한도에 걸리면 남은 초를, 아니면 null을 돌려준다. 소비하지 않는다. */
  retryAfterSec(key: string, limit: number, now: number): number | null {
    const entry = this.current(key, now);
    if (!entry || entry.count < limit) return null;
    return Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
  }

  consume(key: string, now: number): void {
    const entry = this.current(key, now);
    if (entry) {
      entry.count += 1;
      return;
    }
    if (this.entries.size >= PRUNE_THRESHOLD) this.prune(now);
    this.entries.set(key, { count: 1, resetAt: now + this.windowMs });
  }

  private prune(now: number): void {
    for (const [key, entry] of this.entries) {
      if (entry.resetAt <= now) this.entries.delete(key);
    }
  }
}

const GLOBAL_KEY = '*';

interface LimiterState {
  perMinute: FixedWindowCounter;
  perDay: FixedWindowCounter;
  global: FixedWindowCounter;
  inFlight: Set<string>;
}

// dev 서버의 HMR로 모듈이 다시 로드돼도 카운터가 초기화되지 않게 globalThis에 둔다.
const globalForLimiter = globalThis as typeof globalThis & { __plannetAiLimiter?: LimiterState };
const state: LimiterState = (globalForLimiter.__plannetAiLimiter ??= {
  perMinute: new FixedWindowCounter(MINUTE_MS),
  perDay: new FixedWindowCounter(DAY_MS),
  global: new FixedWindowCounter(DAY_MS),
  inFlight: new Set<string>(),
});

export type AcquireResult =
  | { ok: true; release: () => void }
  | { ok: false; reason: 'user-minute' | 'user-day' | 'global-day' | 'in-flight'; retryAfterSec: number };

/** 모든 한도를 먼저 확인한 뒤 한 번에 소비한다. 성공 시 반드시 release()를 호출할 것. */
export function acquireAiQuota(userKey: string, now = Date.now()): AcquireResult {
  const limits = getAiUsageLimits();

  if (state.inFlight.has(userKey)) return { ok: false, reason: 'in-flight', retryAfterSec: 1 };

  const minuteWait = state.perMinute.retryAfterSec(userKey, limits.perUserPerMinute, now);
  if (minuteWait !== null) return { ok: false, reason: 'user-minute', retryAfterSec: minuteWait };

  const dayWait = state.perDay.retryAfterSec(userKey, limits.perUserPerDay, now);
  if (dayWait !== null) return { ok: false, reason: 'user-day', retryAfterSec: dayWait };

  const globalWait = state.global.retryAfterSec(GLOBAL_KEY, limits.globalPerDay, now);
  if (globalWait !== null) return { ok: false, reason: 'global-day', retryAfterSec: globalWait };

  state.perMinute.consume(userKey, now);
  state.perDay.consume(userKey, now);
  state.global.consume(GLOBAL_KEY, now);
  state.inFlight.add(userKey);

  let released = false;
  return {
    ok: true,
    release: () => {
      if (released) return;
      released = true;
      state.inFlight.delete(userKey);
    },
  };
}
