'use client';

import { useAuth } from '@/components/AuthProvider';
import { AuthStatus } from '@/components/AuthStatus';
import { FOCUS_RING } from '@/lib/constants';

/**
 * 로그인 전 공개 화면. 플래너 store·기록을 읽지 않는다 (예시 그림은 고정된 가상 데이터).
 * 확인 중에는 짧은 대기 화면만, 확인 실패 시에는 다시 시도만 제공한다.
 */

const TEMPLATES = [
  { name: '만다라트', role: 'Why', text: '핵심 목표를 9x9 그리드로 나눠 방향을 잡아요.' },
  { name: '월간 플래너', role: 'What & When', text: '이달의 목표와 주차별 초점을 정해요.' },
  { name: 'Block 6', role: 'How', text: '하루를 여섯 블록으로 나눠 한 주를 설계해요.' },
  { name: '투두리스트', role: 'Do', text: '오늘 할 일을 가볍게 체크해요.' },
] as const;

/** 예시 그림 전용 가상 데이터 (실제 기록이 아님) */
const EXAMPLE_GOAL = '건강한 한 해';
const EXAMPLE_SUB_GOALS = ['아침 산책', '물 2L', '7시간 수면', '주 3회 운동', '스트레칭', '채소 한 접시', '명상 10분', '계단 이용'];
const EXAMPLE_TODAY = [
  { text: '아침 산책 20분', done: true },
  { text: '물 2L 마시기', done: false },
  { text: '자기 전 스트레칭', done: false },
];

function Wordmark() {
  return (
    <span className="inline-flex items-center gap-2 text-base font-semibold tracking-tight text-slate-800">
      <span aria-hidden="true" className="grid h-6 w-6 grid-cols-3 gap-px overflow-hidden rounded-md bg-indigo-200 p-px">
        {Array.from({ length: 9 }, (_, i) => (
          <span key={i} className={i === 4 ? 'bg-indigo-600' : 'bg-white'} />
        ))}
      </span>
      Plannet
    </span>
  );
}

function GoogleMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 48 48" className="h-5 w-5">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

function ExamplePlan() {
  const cells = [...EXAMPLE_SUB_GOALS.slice(0, 4), EXAMPLE_GOAL, ...EXAMPLE_SUB_GOALS.slice(4)];
  return (
    <figure className="mx-auto w-full max-w-sm">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid grid-cols-3 gap-1.5">
          {cells.map((cell, i) => (
            <div
              key={cell}
              className={`flex aspect-square items-center justify-center rounded-lg p-1 text-center text-xs leading-tight ${
                i === 4 ? 'bg-indigo-600 font-semibold text-white' : 'bg-slate-50 text-slate-700'
              }`}
            >
              {cell}
            </div>
          ))}
        </div>
        <div className="mt-3 rounded-xl border border-slate-100 bg-slate-50 p-3">
          <p className="text-xs font-medium text-slate-500">오늘</p>
          <ul className="mt-1.5 space-y-1">
            {EXAMPLE_TODAY.map(({ text, done }) => (
              <li key={text} className="flex items-center gap-2 text-sm text-slate-700">
                <span
                  aria-hidden="true"
                  className={`flex h-4 w-4 items-center justify-center rounded border text-xs ${done ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300 bg-white'}`}
                >
                  {done ? '✓' : ''}
                </span>
                <span className={done ? 'text-slate-400 line-through' : ''}>{text}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <figcaption className="mt-2 text-center text-xs text-slate-500">예시 화면 · 실제 기록이 아닌 가상의 예시예요</figcaption>
    </figure>
  );
}

function Checking() {
  return (
    <div className="flex min-h-app flex-col items-center justify-center gap-3 px-6">
      <Wordmark />
      <p role="status" className="text-xs text-slate-500">로그인 상태를 확인하고 있어요</p>
    </div>
  );
}

/** 로그인은 됐지만 서버 저장을 쓸 수 없다. 계정 LocalStorage로 대체하지 않고 다시 시도·로그아웃만 제공한다. */
function StorageUnavailable() {
  const { retry } = useAuth();
  return (
    <div className="flex min-h-app flex-col">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-5 py-5">
        <Wordmark />
        <AuthStatus />
      </header>
      <main className="mx-auto w-full max-w-md flex-1 px-5 py-16">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
          <p role="status" className="text-sm text-amber-800">
            계정 저장소에 연결할 수 없어요. 기록은 서버에만 저장되므로 연결된 뒤에 플래너를 열 수 있어요. 잠시 후 다시 시도해주세요.
          </p>
          <button
            type="button"
            onClick={retry}
            className={`mt-3 rounded-lg border border-amber-300 bg-white px-4 py-2 text-sm font-medium text-amber-900 hover:bg-amber-100 ${FOCUS_RING}`}
          >
            다시 시도
          </button>
        </div>
      </main>
    </div>
  );
}

export function Landing() {
  const { status, login, loginError, retry } = useAuth();
  if (status === 'loading') return <Checking />;
  if (status === 'authenticated') return <StorageUnavailable />;

  return (
    <div className="flex min-h-app flex-col">
      <header className="mx-auto flex w-full max-w-5xl items-center px-5 py-5">
        <Wordmark />
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-5 pb-16">
        <section className="grid items-center gap-10 py-6 md:grid-cols-2 md:py-14">
          <div>
            <p className="text-sm font-medium text-indigo-700">목표에서 오늘 할 일까지</p>
            <h1 className="mt-3 text-4xl font-bold leading-tight tracking-tight text-slate-900 md:text-5xl">
              큰 목표를,
              <br />
              오늘의 한 걸음으로.
            </h1>
            <p className="mt-4 max-w-md text-base leading-relaxed text-slate-600">
              만다라트로 목표를 나누고 월간·주간·일간 계획으로 이어가세요. 기록은 내 계정에 저장되어 어느 기기에서든 이어서 볼 수 있어요.
            </p>

            <div className="mt-8">
              {status === 'unavailable' ? (
                <div className="max-w-md rounded-xl border border-amber-200 bg-amber-50 p-4">
                  <p role="status" className="text-sm text-amber-800">
                    로그인 상태를 확인할 수 없어요. 잠시 후 다시 시도해주세요.
                  </p>
                  <button
                    type="button"
                    onClick={retry}
                    className={`mt-3 rounded-lg border border-amber-300 bg-white px-4 py-2 text-sm font-medium text-amber-900 hover:bg-amber-100 ${FOCUS_RING}`}
                  >
                    다시 시도
                  </button>
                </div>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={login}
                    className={`inline-flex items-center gap-3 rounded-xl bg-slate-900 px-6 py-3 text-base font-semibold text-white shadow-sm transition-colors hover:bg-slate-800 ${FOCUS_RING}`}
                  >
                    <GoogleMark />
                    Google 로그인
                  </button>
                  <p className="mt-3 text-xs text-slate-500">Google 계정으로 로그인하면 바로 시작할 수 있어요.</p>
                  {loginError && (
                    <p role="alert" className="mt-3 text-sm text-red-700">
                      {loginError}
                    </p>
                  )}
                </>
              )}
            </div>
          </div>

          <ExamplePlan />
        </section>

        <section aria-labelledby="landing-templates" className="border-t border-slate-200 pt-10">
          <h2 id="landing-templates" className="text-lg font-semibold text-slate-900">
            목표를 실행으로 잇는 네 가지 템플릿
          </h2>
          <ul className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {TEMPLATES.map(({ name, role, text }) => (
              <li key={name} className="rounded-xl border border-slate-200 bg-white/80 p-4">
                <p className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-semibold text-slate-800">{name}</span>
                  <span className="text-xs font-medium text-indigo-700">{role}</span>
                </p>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{text}</p>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  );
}
