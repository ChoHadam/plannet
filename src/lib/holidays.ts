/**
 * 공휴일 유틸 — `@hyunbinseo/holidays-kr` wrapper + 순수 함수 모음.
 *
 * 설계 원칙:
 * - React/store 의존 없음 → 테스트와 재사용 용이
 * - 자동 휴일은 매 호출 시 라이브러리에서 조회 (저장 안 함)
 * - 수동 휴일은 호출자가 manualMap을 인자로 전달 (store-agnostic)
 * - 수동 → 자동 우선순위
 */

import {
  y2018, y2019, y2020, y2021, y2022, y2023, y2024, y2025, y2026,
} from '@hyunbinseo/holidays-kr';

export type HolidaySource = 'auto' | 'manual';

export interface HolidayInfo {
  source: HolidaySource;
  name: string;
}

export interface ManualHoliday {
  date: string;       // ISO YYYY-MM-DD
  name?: string;
  createdAt: string;
}

export type ManualHolidayMap = Record<string, ManualHoliday>;

// 라이브러리가 제공하는 연도별 정적 객체를 한 곳에 모음.
// 추후 라이브러리에 새 연도가 추가되면 여기만 import 추가하면 됨.
const YEAR_PRESETS: Record<number, Readonly<Record<string, readonly string[]>>> = {
  2018: y2018, 2019: y2019, 2020: y2020, 2021: y2021,
  2022: y2022, 2023: y2023, 2024: y2024, 2025: y2025, 2026: y2026,
};

/**
 * 로컬 시간 기준 ISO 날짜 문자열 (YYYY-MM-DD).
 * `toISOString()`을 쓰면 TZ에 따라 하루씩 어긋나므로 직접 조립.
 */
export function toIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseIsoDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** 자동 공휴일 조회. 라이브러리가 미지원하는 연도면 null. */
export function getAutoHoliday(date: Date): { name: string } | null {
  const preset = YEAR_PRESETS[date.getFullYear()];
  if (!preset) return null;
  const iso = toIsoDate(date);
  const names = preset[iso];
  if (!names || names.length === 0) return null;
  return { name: names.join(', ') };
}

/**
 * 특정 날짜의 휴일 정보. 수동 마킹이 자동 휴일을 덮어씀(이름 포함).
 */
export function isHolidayDate(
  date: Date,
  manualMap: ManualHolidayMap,
): HolidayInfo | null {
  const iso = toIsoDate(date);
  const manual = manualMap[iso];
  if (manual) {
    return { source: 'manual', name: manual.name || '' };
  }
  const auto = getAutoHoliday(date);
  if (auto) return { source: 'auto', name: auto.name };
  return null;
}

/** 특정 월의 모든 휴일 정보 (자동 + 수동). */
export function getHolidaysInMonth(
  year: number,
  month: number,
  manualMap: ManualHolidayMap,
): Record<string, HolidayInfo> {
  const result: Record<string, HolidayInfo> = {};

  // 자동
  const preset = YEAR_PRESETS[year];
  if (preset) {
    const prefix = `${year}-${String(month).padStart(2, '0')}-`;
    for (const iso of Object.keys(preset)) {
      if (iso.startsWith(prefix)) {
        result[iso] = { source: 'auto', name: preset[iso].join(', ') };
      }
    }
  }

  // 수동 (자동 덮어쓰기)
  const manualPrefix = `${year}-${String(month).padStart(2, '0')}-`;
  for (const iso of Object.keys(manualMap)) {
    if (iso.startsWith(manualPrefix)) {
      result[iso] = { source: 'manual', name: manualMap[iso].name || '' };
    }
  }

  return result;
}

/** 주어진 날짜 배열에 대한 휴일 정보 (Block6 헤더용). */
export function getHolidaysInWeek(
  weekDates: Date[],
  manualMap: ManualHolidayMap,
): Record<string, HolidayInfo> {
  const result: Record<string, HolidayInfo> = {};
  for (const d of weekDates) {
    const info = isHolidayDate(d, manualMap);
    if (info) result[toIsoDate(d)] = info;
  }
  return result;
}
