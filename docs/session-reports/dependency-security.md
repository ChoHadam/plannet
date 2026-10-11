# 의존성 보안 유지보수 1단계 (Next.js 16.1.1 → 16.3.8)

2026-10-04 · 기준 `3e08caa` + 기존 미커밋 변경. [UI·UX 검토](../ui-ux-review.md)의 "선행 의존성 보안". **Claude Opus 구현·검증 및 총괄 변경 범위·검증 근거 검토 완료, 배포하지 않음.** 커밋·push 없음.

## 무엇을 했나

| 패키지 | 이전 | 이후 | 이유 |
|---|---|---|---|
| `next` | 16.1.1 | **16.3.8** | 9/30 공식 보안 릴리스 권장 버전. 레지스트리 `latest`=16.3.8 확인 |
| `eslint-config-next` | 16.1.1 | **16.3.8** | `next`와 같은 버전 유지 |
| `react` / `react-dom` | 19.2.3 | 19.2.3 (유지) | 16.3.8 peer `^19.0.0` 충족. React 보안 수정 대상은 `react-server-dom-*`이며 App Router는 Next 내장 React(`19.3.0-canary-…-20260731`)를 쓴다. React 공지가 `react`/`react-dom` 갱신은 필요 없다고 명시 |

- 정확한 버전 고정(`--save-exact`), `npm install --no-audit --no-fund`. 루트 `package.json`·워크스페이스 구성 불변
- lockfile 변화는 Next 의존 트리뿐: `@next/*` 16.3.8, `sharp` 0.34.5→0.35.5(Next의 선택 의존 `^0.35.4`), `@swc/helpers`, `postcss` 8.5.23(Next 고정값으로 중복 제거), `baseline-browser-mapping`, 전이 의존 `nanoid`·`picomatch`·`fastq` 패치 버전
- 엔진: `next`·`sharp` 모두 Node `>=20.9.0`. 로컬 Node 23.11, Docker `node:20-alpine` 충족
- `AGENTS.md`의 "Next.js 14" → "Next.js 16.3.8 (App Router, standalone output) + React 19.2"
- 앱 코드·설정·API·DB·인프라·UX 변경 없음. 호환성 수정도 필요 없었다

## 9/30 공지 7건 적용 여부 (16.1.1 기준, 사용 기능 근거)

| 이슈 (심각도) | 조건 | Plannet 근거 | 적용 |
|---|---|---|---|
| Image Optimization SSRF (High) CVE-2026-94483 | `images.remotePatterns` 설정 | `next.config.ts`에 `images` 없음, `next/image` 미사용. standalone `/_next/image?url=http://169.254.169.254/…` → **400** | 아님 |
| Pages Router SSG/ISR 캐시 오염 (Medium) CVE-2026-94543 | Pages Router | `pages/` 없음. `src/app`만 존재 | 아님 |
| 루트 catch-all + SSG/ISR 오염 (Medium) CVE-2026-94484 | 루트 catch-all 페이지 | 경로는 `/`(정적), `/_not-found`, `/api/backup`·`/api/chat`·`/api/runtime-config`. catch-all 없음 | 아님 |
| 메타데이터 이미지 `dynamicParams` 우회 (Medium) CVE-2026-94485 | webpack 빌드 + `opengraph-image` 등 | 운영 빌드는 Turbopack(빌드 로그). 메타데이터 이미지 경로 없음(`favicon.ico` 정적 파일뿐) | 아님 |
| 중첩 `use cache` root param 누출 (Medium) GHSA-h694-7cp9-m8p3 | Cache Components | `cacheComponents`·`'use cache'` 없음 | 아님 |
| `use cache` Draft Mode 누출 (Medium) CVE-2026-94544 | Cache Components + Draft Mode | 둘 다 없음 | 아님 |
| `next dev` MCP origin 미검증 (Low) CVE-2026-94486 | `next dev` 실행 중 | 운영은 standalone(`/_next/mcp` → **404**). 개발자가 `npm run dev` 중 악성 사이트를 열면 해당 | **개발 환경만** |

공지 문구대로 9/30 릴리스는 7건을 고쳤고, **나머지 2건(critical 1, high 1)은 상위 의존성 조율 때문에 이후 릴리스로 미뤄졌다.** 그 2건의 내용·영향은 공개되지 않았다. 따라서 "알려진 취약점이 모두 해결됐다"고 말할 수 없다. 9/30 GHSA 7건은 2026-10-04 기준 GitHub 공개 DB에서 조회되지 않아(404) 정확한 영향 범위는 확인하지 못했다. 위 판단은 공지 문구의 조건과 사용 기능 기준이다.

## 그 이전 공지 (16.1.1이 영향 범위)

GitHub 공개 DB 조회 결과 `next@16.1.1`에 해당하는 공개 권고는 **33건**, `next@16.3.8`은 **0건**(미공개 2건 제외). 이번 앱에 실제로 닿는 주요 항목:

| 공지 | 16.1.1 해당·앱 노출 | 16.3.8 |
|---|---|---|
| 1월 RSC 역직렬화 DoS (High, GHSA-h25m-26qc-wcjf), 4·5월 Server Components DoS (High) | App Router 요청이면 해당. **노출됨** | 수정 |
| 3월 null origin CSRF·dev HMR, `next/image` 디스크 캐시, rewrites 요청 밀반입 | Server Action·rewrites 없음. `/_next/image`는 로컬 파일만 | 수정 |
| 5월 묶음(미들웨어 우회·WebSocket SSRF·RSC 캐시 오염·CSP nonce XSS 등) | 미들웨어·i18n·nonce 없음. RSC 캐시 오염류는 앞단 캐시가 있으면 조건부 | 수정 |
| 7월 묶음(Server Action DoS·rewrites SSRF·`fetch` 캐시 혼동 등) | Server Action·rewrites 없음. 서버 `fetch`는 본문 없는 세션 확인뿐 | 수정 |
| 8월 AVIF 이미지 RCE(Critical)·Windows RCE(Critical) | 원격 이미지 없음·Linux 운영. 실질 노출 낮음 | 수정 |
| 9/22 `ImageResponse` RCE | 16.2.0~16.3.5만 해당. **16.1.1 아님**, `next/og` 미사용 | 수정 |

## 발견 사항 (기존 동작, 이번 변경 아님)

- 16.3.8 Turbopack이 `/api/backup`의 `fs.readdir/readFile(BACKUP_DIR…)` 때문에 "프로젝트 전체 추적" 경고를 낸다. standalone 출력에 `apps/web/src`·`e2e`·설정 파일이 들어간다
- 같은 소스를 격리 복사본에서 **16.1.1로 빌드해 비교한 결과 추적 목록이 동일**했다(복사 시 제외한 tsbuildinfo·`.DS_Store`만 차이). 즉 기존부터 그랬고 16.3.8은 경고만 추가했다
- `.env*`·`.local-backup`·키 파일은 들어가지 않는다(`outputFileTracingExcludes`, `.dockerignore`, 하네스 정리). 서버가 이 파일들을 HTTP로 제공하지는 않는다. 경로 범위 축소는 별도 변경으로 남긴다

## 검증

모두 격리 포트·새 빌드, 가상 계정·가상 플랜. 인증·저장 API·AI는 기존 모의 서버 또는 브라우저 가로채기. 실제 DB·Google·유료 AI·사용자 브라우저 저장소·3000번 서비스에 접근하지 않았다.

| 명령 (`apps/web`) | 결과 |
|---|---|
| `npx tsc --noEmit -p tsconfig.json` | 통과 |
| `npx eslint` (`npm run lint`와 같음) | 통과 |
| `npx playwright test -c playwright.config.ts` (3310~3315, 새 `.next/e2e` standalone, Turbopack) | **74 passed** (local 10 + auth 64: 랜딩·로그인/로그아웃·DB 전용·자동 저장 임시 보관·로그아웃 대기·계정 격리·AI 인증) |
| `STORAGE_SYNC_WORK_DIR=<새 디렉터리> npx playwright test -c playwright.storage-sync.config.ts` (3680) | **39 passed** (logic 31 + browser 8: 충돌·재전송·계정 전환·오프라인 첫 로드) |
| `npx playwright test -c playwright.ux-foundation.config.ts` (3650, webpack 빌드) | **19 passed** |
| standalone 직접 확인 (3690, 인증 off) | 보안 헤더 5종 유지, `X-Powered-By` 없음, 원격 이미지 400, `/_next/mcp` 404, 임의 경로 404, `/api/backup` 403 |

첫 실행에서 모두 통과해 재실행·범위 확대는 하지 않았다. storage-sync는 이전 실행의 `node_modules`(16.1.1)를 재사용하지 않도록 새 작업 디렉터리를 지정했다.

**한계:** 저장 API는 모의 서버다(이번 변경은 API·DB를 건드리지 않아 실제 PostgreSQL 스위트는 돌리지 않음). Docker 이미지·HTTPS 리허설·ai-response-safety·plan-library·period-and-import·mandalart-io 스위트는 다시 돌리지 않았다. `npm audit`는 실행하지 않았으므로 전체 의존성 감사가 아니다. 3000번 로컬 서비스는 여전히 16.1.1이다.

## 총괄 결정이 필요한 것

1. 3000번 로컬 서비스·이후 배포에 16.3.8 빌드를 반영할지
2. 미뤄진 critical 1·high 1 후속 릴리스 추적(다음 Next 패치 때 같은 절차 반복)
3. `/api/backup` 파일 접근 범위 축소로 standalone 전체 추적 제거(별도 변경)
4. `CLAUDE.md`에도 같은 "Next.js 14" 표기가 남아 있음(이번 범위는 `AGENTS.md`만)
5. Docker 기반 `node:20-alpine` 런타임 갱신 여부(엔진 조건은 충족)

## 출처

- [9/30 보안 릴리스](https://nextjs.org/blog/september-2026-security-release) · [9월 사전 공지(2건 연기 명시)](https://nextjs.org/blog/upcoming-nextjs-security-release-september-2026) · [9/22 업데이트](https://nextjs.org/blog/nextjs-security-update-september-22-2026)
- [8월 릴리스](https://nextjs.org/blog/august-2026-security-release) · [7월 릴리스](https://nextjs.org/blog/july-2026-security-release) · [5월 공지(Vercel)](https://vercel.com/changelog/next-js-may-2026-security-release) · [2025-12-11 업데이트](https://nextjs.org/blog/security-update-2025-12-11)
- [React RSC DoS·소스 노출 공지](https://react.dev/blog/2025/12/11/denial-of-service-and-source-code-exposure-in-react-server-components)
- 레지스트리: `https://registry.npmjs.org/next/16.3.8`, `https://registry.npmjs.org/eslint-config-next/16.3.8` · 권고 DB: `https://api.github.com/advisories?ecosystem=npm&affects=next@<버전>`

## 총괄 검토 (2026-10-04)

작업 시작 시점 312개 파일의 해시 기준으로 앱 소스·API·인프라 변경이 없음을 확인했다. 변경은 의존성 manifest/lock·문서와 무시되는 next-env 생성 파일이다. manifest/lock의 Next·eslint-config-next 16.3.8 일치, 74·39·19개 통과 로그와 종료 코드, tsc/lint 로그, standalone 확인 결과, `git diff --check`를 검토했다. 테스트를 재실행하거나 실제 3000번 프로세스 버전을 조회한 것은 아니다. 현 실행 서비스에는 이번 빌드를 반영하지 않았다. 전체 의존성 감사나 미공개 취약점 해결을 뜻하지 않는다. 다음 작업은 URL 작업 복귀·빠른 시작으로 진행하며 홈서버·런타임/배포 및 tracing 축소는 별도 후속이다.
