import { test, expect } from '@playwright/test';
import {
  getCurrentWeeklyFocus, getWeekCountInMonth, getWeekDates, getWeekOfMonth, getWeeksOfMonth,
  MAX_WEEKS_IN_MONTH, mondayIndex, SATURDAY_INDEX, SUNDAY_INDEX, WEEKDAY_LABELS,
} from '../../src/lib/weekUtils';
import {
  createInitialWeeklyFocus, getWeeklyFocusRows, isValidWeeklyFocusWeeks, LEGACY_WEEKLY_FOCUS_WEEKS,
  MonthlyData, WeeklyFocus, withWeeklyFocusText,
} from '../../src/types/monthly';
import { useMonthlyStore } from '../../src/hooks/useMonthly';
import { validatePlannerDocuments } from '../../src/lib/plannerSyncStores';

/**
 * 공통 주차 규칙(월~일, 1일이 든 주 = W1)과 Monthly W6 저장 계약의 순수 함수 검사. 브라우저·서버 없음.
 * 시간대는 실행 환경의 현지 시각을 그대로 쓴다(모든 날짜를 현지 자정으로 만든다).
 */

const ymd = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const range = (meta: { start: Date; end: Date }) => `${ymd(meta.start)}~${ymd(meta.end)}`;
const legacyFocus = (prefix = 'W'): WeeklyFocus[] => [1, 2, 3, 4, 5].map((weekNumber) => ({ weekNumber, text: `${prefix}${weekNumber}` }));
const sixFocus = (prefix = 'W'): WeeklyFocus[] => [1, 2, 3, 4, 5, 6].map((weekNumber) => ({ weekNumber, text: `${prefix}${weekNumber}` }));
const monthly = (year: number, month: number, weeklyFocus: WeeklyFocus[]): MonthlyData => ({
  id: `m-${year}-${month}`, title: '가상 월간', template: 'monthly', category: 'monthly', year, month,
  goals: [{ id: 'g1', text: '목표', progress: 40, completed: false, sourceMandalartId: 'src', sourceCellId: 'top-left-1' }],
  weeklyFocus, memo: '메모', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
});

test.describe('공통 주차 규칙', () => {
  test('4·5·6주인 달, 윤년 2월, 일요일 시작·일요일 끝, 연말·연초 경계', () => {
    const cases: [number, number, string[]][] = [
      // 4주: 1일이 월요일인 28일 2월
      [2027, 2, ['2027-02-01~2027-02-07', '2027-02-08~2027-02-14', '2027-02-15~2027-02-21', '2027-02-22~2027-02-28']],
      // 5주
      [2026, 10, ['2026-09-28~2026-10-04', '2026-10-05~2026-10-11', '2026-10-12~2026-10-18', '2026-10-19~2026-10-25', '2026-10-26~2026-11-01']],
      // 6주: 1일이 일요일 → W1은 하루, 3/30·31이 W6
      [2026, 3, ['2026-02-23~2026-03-01', '2026-03-02~2026-03-08', '2026-03-09~2026-03-15', '2026-03-16~2026-03-22', '2026-03-23~2026-03-29', '2026-03-30~2026-04-05']],
      // 6주: 1일이 토요일, 31일이 월요일
      [2026, 8, ['2026-07-27~2026-08-02', '2026-08-03~2026-08-09', '2026-08-10~2026-08-16', '2026-08-17~2026-08-23', '2026-08-24~2026-08-30', '2026-08-31~2026-09-06']],
      // 윤년 2월(목요일 시작)
      [2024, 2, ['2024-01-29~2024-02-04', '2024-02-05~2024-02-11', '2024-02-12~2024-02-18', '2024-02-19~2024-02-25', '2024-02-26~2024-03-03']],
      // 윤년 2월이 일요일에 시작하고 일요일(29일)에 끝남
      [2032, 2, ['2032-01-26~2032-02-01', '2032-02-02~2032-02-08', '2032-02-09~2032-02-15', '2032-02-16~2032-02-22', '2032-02-23~2032-02-29']],
      // 연말 → 다음 해로 넘어가는 마지막 주, 연초 → 전년에서 시작하는 첫 주
      [2025, 12, ['2025-12-01~2025-12-07', '2025-12-08~2025-12-14', '2025-12-15~2025-12-21', '2025-12-22~2025-12-28', '2025-12-29~2026-01-04']],
      [2027, 1, ['2026-12-28~2027-01-03', '2027-01-04~2027-01-10', '2027-01-11~2027-01-17', '2027-01-18~2027-01-24', '2027-01-25~2027-01-31']],
    ];
    for (const [year, month, expected] of cases) {
      expect(getWeeksOfMonth(year, month).map(range), `${year}-${month}`).toEqual(expected);
      expect(getWeekCountInMonth(year, month)).toBe(expected.length);
    }

    const weekOf: [string, number][] = [
      ['2026-03-01', 1], ['2026-03-02', 2], ['2026-03-29', 5], ['2026-03-30', 6], ['2026-03-31', 6],
      ['2026-04-01', 1], ['2026-04-05', 1], ['2026-04-06', 2],
      ['2025-12-31', 5], ['2026-01-01', 1], ['2026-12-31', 5], ['2027-01-01', 1], ['2027-01-03', 1], ['2027-01-04', 2],
      ['2024-02-29', 5], ['2032-02-29', 5], ['2027-02-28', 4],
    ];
    for (const [iso, week] of weekOf) {
      const [y, m, d] = iso.split('-').map(Number);
      expect(getWeekOfMonth(new Date(y, m - 1, d, 23, 30)), iso).toBe(week);
    }
  });

  test('2000~2100년 모든 달: 월요일 시작 7일 연속, W1에 1일, 마지막 주에 말일, 모든 날짜가 정확히 한 주', () => {
    // 항목마다 expect를 부르면 수 분이 걸려 위반을 모아 한 번에 비교한다.
    const counts = new Set<number>();
    const violations: string[] = [];
    const check = (ok: boolean, message: string) => { if (!ok) violations.push(message); };
    for (let year = 2000; year <= 2100; year++) {
      for (let month = 1; month <= 12; month++) {
        const key = `${year}-${month}`;
        const weeks = getWeeksOfMonth(year, month);
        counts.add(weeks.length);
        check(weeks.length >= 4 && weeks.length <= MAX_WEEKS_IN_MONTH, `${key} count ${weeks.length}`);
        weeks.forEach((week, i) => {
          check(week.weekOfMonth === i + 1, `${key} W${i + 1} number`);
          check(week.dates.length === 7 && week.dates.every((date, column) => mondayIndex(date) === column), `${key} W${i + 1} columns`);
          check(week.start === week.dates[0] && week.end === week.dates[6], `${key} W${i + 1} bounds`);
          check(week.dates.map(ymd).join() === getWeekDates(year, month, i + 1).map(ymd).join(), `${key} W${i + 1} getWeekDates`);
          if (i > 0) check(week.start.getTime() - weeks[i - 1].start.getTime() > 6 * 86_400_000, `${key} W${i + 1} contiguous`);
        });
        check(weeks[0].dates.map(ymd).includes(ymd(new Date(year, month - 1, 1))), `${key} W1 has day 1`);
        check(weeks.at(-1)!.dates.map(ymd).includes(ymd(new Date(year, month, 0))), `${key} last week has last day`);
        for (let day = 1; day <= new Date(year, month, 0).getDate(); day++) {
          const iso = ymd(new Date(year, month - 1, day));
          const owners = weeks.filter((week) => week.dates.some((date) => ymd(date) === iso)).map((week) => week.weekOfMonth);
          check(owners.length === 1 && owners[0] === getWeekOfMonth(new Date(year, month - 1, day)), `${iso} owners ${owners}`);
        }
      }
    }
    expect(violations).toEqual([]);
    expect([...counts].sort()).toEqual([4, 5, 6]);
    expect(WEEKDAY_LABELS[0]).toBe('월');
    expect(WEEKDAY_LABELS[SATURDAY_INDEX]).toBe('토');
    expect(WEEKDAY_LABELS[SUNDAY_INDEX]).toBe('일');
  });

  test('2026-03-30 이번 주 포커스는 W6: 이전 5개 플랜은 비어 있음, 6개 플랜은 W6 내용', () => {
    const date = new Date(2026, 2, 30, 9);
    const legacy = getCurrentWeeklyFocus([monthly(2026, 3, legacyFocus())], date);
    expect(legacy.weekNumber).toBe(6);
    expect(legacy.monthlyPlan?.id).toBe('m-2026-3');
    expect(legacy.focus).toBeNull();
    const six = getCurrentWeeklyFocus([monthly(2026, 3, sixFocus())], date);
    expect(six.focus).toEqual({ weekNumber: 6, text: 'W6' });
    // 4/1은 4월 W1(3/30~4/5)로 4월 플랜을 본다
    expect(getCurrentWeeklyFocus([monthly(2026, 3, sixFocus())], new Date(2026, 3, 1)).monthlyPlan).toBeNull();
  });
});

test.describe('주간 포커스 저장 계약', () => {
  test('주 번호는 1~5 또는 1~6을 빠짐·중복 없이 한 번씩(순서 무관)', () => {
    expect(LEGACY_WEEKLY_FOCUS_WEEKS).toBe(5);
    for (const valid of [[1, 2, 3, 4, 5], [1, 2, 3, 4, 5, 6], [6, 1, 3, 2, 5, 4], [5, 4, 3, 2, 1]]) {
      expect(isValidWeeklyFocusWeeks(valid), JSON.stringify(valid)).toBe(true);
    }
    for (const invalid of [[], [1, 2, 3, 4], [1, 2, 3, 4, 5, 6, 7], [1, 2, 3, 4, 4], [1, 2, 3, 4, 5, 5], [1, 2, 3, 4, 6],
      [2, 3, 4, 5, 6], [1, 2, 3, 4, 5, 7], [0, 1, 2, 3, 4, 5], ['1', 2, 3, 4, 5], [1.5, 2, 3, 4, 5], [null, 2, 3, 4, 5, 6]]) {
      expect(isValidWeeklyFocusWeeks(invalid), JSON.stringify(invalid)).toBe(false);
    }
  });

  test('불러오기 검증: 이전 5개·새 6개는 통과, 형식이 다르면 거부', () => {
    const doc = (weeklyFocus: unknown) => ({ kind: 'monthly' as const, id: 'm-2026-3', data: { ...monthly(2026, 3, []), weeklyFocus } as never });
    expect(() => validatePlannerDocuments([doc(legacyFocus()), doc(sixFocus())])).not.toThrow();
    for (const bad of [legacyFocus().slice(0, 4), [...sixFocus(), { weekNumber: 7, text: '' }], [...legacyFocus(), { weekNumber: 5, text: '' }],
      legacyFocus().map((w) => ({ ...w, weekNumber: w.weekNumber + 1 })), [...legacyFocus().slice(0, 4), { weekNumber: '5', text: '' }],
      [...legacyFocus().slice(0, 4), { weekNumber: 5 }], [1, 2, 3, 4, 5], 'W1~W5']) {
      expect(() => validatePlannerDocuments([doc(bad)]), JSON.stringify(bad)).toThrow();
    }
  });

  test('W6 편집: 이전 5개 항목은 그대로 두고 W6만 추가, 같은 내용·빈 W6·범위 밖은 원본 유지', () => {
    const legacy = legacyFocus();
    const added = withWeeklyFocusText(legacy, 6, '새 W6');
    expect(added).toHaveLength(6);
    added.slice(0, 5).forEach((item, i) => expect(item).toBe(legacy[i]));
    expect(added[5]).toEqual({ weekNumber: 6, text: '새 W6' });
    expect(isValidWeeklyFocusWeeks(added.map((w) => w.weekNumber))).toBe(true);

    expect(withWeeklyFocusText(legacy, 3, 'W3')).toBe(legacy);
    expect(withWeeklyFocusText(legacy, 6, '')).toBe(legacy);
    expect(withWeeklyFocusText(legacy, 7, 'x')).toBe(legacy);
    expect(withWeeklyFocusText(legacy, 0, 'x')).toBe(legacy);
    const changed = withWeeklyFocusText(legacy, 2, '바뀐 W2');
    expect(changed).toHaveLength(5);
    expect(changed[1]).toEqual({ weekNumber: 2, text: '바뀐 W2' });
    expect(legacy[1].text).toBe('W2');
    expect(createInitialWeeklyFocus()).toEqual([1, 2, 3, 4, 5, 6].map((weekNumber) => ({ weekNumber, text: '' })));
  });

  test('화면 행: 그 달의 주는 모두, 그 달에 없는 주는 내용이 있을 때만 보관 표시', () => {
    const rows = (year: number, month: number, focus: WeeklyFocus[]) =>
      getWeeklyFocusRows({ year, month, weeklyFocus: focus }).map((r) => `W${r.weekNumber}:${r.text}:${r.inMonth ? 'in' : 'kept'}`);
    expect(rows(2026, 3, legacyFocus())).toEqual(['W1:W1:in', 'W2:W2:in', 'W3:W3:in', 'W4:W4:in', 'W5:W5:in', 'W6::in']);
    expect(rows(2026, 10, sixFocus())).toEqual(['W1:W1:in', 'W2:W2:in', 'W3:W3:in', 'W4:W4:in', 'W5:W5:in', 'W6:W6:kept']);
    expect(rows(2027, 2, sixFocus())).toEqual(['W1:W1:in', 'W2:W2:in', 'W3:W3:in', 'W4:W4:in', 'W5:W5:kept', 'W6:W6:kept']);
    expect(rows(2027, 2, legacyFocus().map((w) => (w.weekNumber === 5 ? { ...w, text: '' } : w)))).toEqual(['W1:W1:in', 'W2:W2:in', 'W3:W3:in', 'W4:W4:in']);
  });

  test('store: 새 플랜은 W1~W6, 이전 5개 플랜은 읽기·같은 내용 저장·날짜 변경으로 바뀌지 않고 W6 입력 때만 6개', () => {
    const legacy = monthly(2026, 3, legacyFocus());
    useMonthlyStore.setState({ monthlyPlans: [legacy], currentMonthlyId: legacy.id, viewedMonth: null });
    const store = useMonthlyStore.getState();

    store.updateWeeklyFocus(3, 'W3');
    store.updateWeeklyFocus(6, '');
    expect(useMonthlyStore.getState().monthlyPlans[0]).toBe(legacy);

    store.updatePlanDate(2027, 2);
    const moved = useMonthlyStore.getState().monthlyPlans[0];
    expect(moved.weeklyFocus).toBe(legacy.weeklyFocus);
    expect([moved.year, moved.month]).toEqual([2027, 2]);
    store.updatePlanDate(2026, 3);

    store.updateWeeklyFocus(6, '  W6 입력  ');
    const edited = useMonthlyStore.getState().monthlyPlans[0];
    expect(edited.weeklyFocus.map((w) => w.weekNumber)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(edited.weeklyFocus[5].text.trim()).toBe('W6 입력');
    const omit = (plan: MonthlyData) => Object.fromEntries(Object.entries(plan).filter(([key]) => !['weeklyFocus', 'updatedAt'].includes(key)));
    expect(omit(edited)).toEqual(omit(legacy));

    const id = store.createMonthlyPlan('monthly', 2026, 10);
    expect(useMonthlyStore.getState().monthlyPlans.find((p) => p.id === id)!.weeklyFocus).toEqual(createInitialWeeklyFocus());
  });
});
