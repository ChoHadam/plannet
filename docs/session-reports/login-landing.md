# 로그인 랜딩 게이트

2026-09-28 · 기준 `3e08caa` + 미커밋 변경. 인증이 켜진 환경에서 로그인 전 브라우저 기록이 보이던 문제를 로그인 랜딩으로 바꿨다.

## 변경

| 영역 | 내용 |
|---|---|
| 입장 게이트 | `/`는 `authenticated`·명시적 인증 꺼짐(`disabled`)에서만 `PlannerWorkspace`를 마운트한다. 확인 중·미로그인·확인 불가는 `Landing`만 렌더링해 store 복원·동기화·자동 백업·AI가 시작되지 않는다 |
| 저장 범위 | `storageScope`는 인증 확인 후 계정/서버 캐시 범위, 로컬 모드에서만 LOCAL, 그 밖에는 `null` |
| 설정 fail closed | `/api/runtime-config` 5초 제한. 네트워크 실패·비2xx·JSON 아님·필드 누락·boolean 아님은 `unavailable`(다시 시도). 유효한 `authEnabled:false`만 로컬 모드 |
| 로그아웃 | 204 후 `location.replace('/')`. bfcache로 복원되면 다시 불러와 재확인. API·CSRF 가드는 그대로 |
| 안내 문구 | "로그아웃하면 로그인 전 플랜을 다시 볼 수 있어요" 제거(더 이상 사실이 아님). 로그인 후 명시적 가져오기는 그대로 |
| 화면 | 워드마크, hero "큰 목표를, 오늘의 한 걸음으로.", Google 로그인 CTA 1개, 가상 예시 3×3·오늘 목록(캡션 표시), 템플릿 4종 소개. 360px 1열 |

원본 로컬 키와 서버 기록은 읽거나 바꾸지 않는다. 원본은 로그인 후 `로그인 전 기록 가져오기`로만 계정에 복사된다.

## 실행한 검증 (합성 인프라만)

| 대상 | 결과 |
|---|---|
| `tsc --noEmit`, `eslint src` | 통과 |
| 기본 E2E (`local` 템플릿 10 + `auth` 44, 모의 Spring·edge) | **54 passed**. 새 `auth-landing.spec.ts` 12개 포함: 미로그인·느린 me·me 실패 3종·runtime-config 실패 5종·로그아웃 후 새로고침/뒤로 가기·재로그인 계정 격리·로그인 실패 alert. 매번 고유 제목 원본의 미표시와 원본 문자열 불변 확인 |
| storage-sync (22) | 첫 실행은 하네스의 오래된 임시 `node_modules` 복제본(`next` 누락)으로 빌드 전 실패 → 그 임시 복제본만 지우고 재실행 **22 passed** |
| ai-response-safety (34), plan-library (15) | **passed** |
| server-storage (실제 Spring + 일회용 PostgreSQL, 6) | **6 passed** (로그인 전 원본 명시적 가져오기 포함) |
| 화면 확인 | 1280px·360px 스크린샷, 가로 넘침 0px, CTA 키보드 포커스 링 확인 |

수정한 기존 테스트: `auth-storage.spec.ts`(원본을 UI 대신 직접 심고 랜딩에서 미표시 확인), `auth-flow.spec.ts`(미로그인 AI 안내 → 랜딩 게이트, 인증 장애 시 플래너 미마운트). `infra/deploy/verify/e2e/flow.spec.ts`의 API 장애 단계도 랜딩 기준으로 바꿨으나 **kind 클러스터에서 실행하지 않았다.**

## 총괄의 로컬 반영·브라우저 확인

- 위 검증과 동일한 앱 소스의 standalone 빌드를 분리된 디렉터리에 보관하고 Web만 교체했다. 기존 API·DB·3000번 프록시는 유지했다.
- 별도 브라우저의 1440px·360px 화면에서 랜딩·키보드 포커스·가로 넘침 없음, 가상 원본 제목의 순간 노출 없음과 저장 문자열 불변을 확인했다.
- 실제 `http://localhost:3000` 탭에서 미로그인 응답(401), 랜딩, 로그인 버튼 1개, 플래너 사이드바 없음과 기존 브라우저 저장 항목 16개의 값 불변을 확인했다. DB에 쓰기 요청을 보내지 않았다.
- 빌드 후 앱 소스의 추가 수정은 `plannerStorage.ts` 설명 주석뿐이다. 이번 작업에서 실제 Google 재로그인과 홈서버 공개 환경 검증은 수행하지 않았다. 구현·회귀는 Claude Opus에 위임하고 총괄이 검토·로컬 반영했다. 커밋·push하지 않았다.
