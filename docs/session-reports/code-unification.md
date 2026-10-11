# 원본 Plannet ↔ services/apps/plannet 코드 통일

2026-10-11 · Opus 구현. 구현 작업자는 커밋·push·PR·병합·배포를 하지 않았다(게시는 총괄이 별도로 수행). 작업 기록: `/private/tmp/plannet-code-unification-job` (`plan.md`, `compare.json`, `logs/`, 확장 `full-local-sync/`).

이 파일은 원본과 services 사본에 같은 내용으로 둔다. 1단계(앱 코드 통일)와 2단계(문서·관리 파일 전체 반영, [아래](#2단계--로컬-문서관리-파일-전체-반영)) 기록이다.

## 기준

| 위치 | 기준 |
|---|---|
| 원본 | `feat/web-spring-auth` 32c6c8e + 커밋하지 않은 작업 트리 (origin/main 8b747e0은 32c6c8e의 조상) |
| services | `MyoungHaSong/services` origin/main 4c5d109 → 깨끗한 clone `codex/unify-plannet`, 수정 범위 `apps/plannet` |
| 모바일 변경 | `/private/tmp/plannet-services-handoff` (`codex/ios-webapp`, 같은 4c5d109, 읽기 전용). 수정 39개와 새 파일 8개만 사용 |

## 무엇을 했나

```
services HEAD ─(+모바일 변경 47)─▶ services/apps/plannet ┐
                                                         ├─ 앱 코드·테스트·빌드 입력 294개 해시 동일
원본 작업 트리 ─(+같은 파일 42, 문서 패치 4)──▶ 원본 ┘
```

- 비교 결과(import manifest, services HEAD, 원본 작업 트리 비교): 원본 작업 트리는 import한 306개와 모두 같았다. 원본에만 있는 107개는 모두 문서·이미지·artifacts·AGENTS였다. 앱 코드는 원래 양쪽이 같았고, 남은 차이는 모바일 변경뿐이었다
- 모바일 변경이 빠짐없는지 확인: 마지막 모바일 빌드 스냅샷(`plannet-period-import-YcdY5U`)의 src·public 120개는 핸드오프의 현재 파일 40개 + services HEAD 80개와 모두 같았다. 핸드오프에서 사라진 파일 안에 숨은 모바일 수정은 없다
- services: 모바일 변경 47개를 적용했다. 적용 후 diff는 핸드오프 diff와 바이트 단위로 같다
- 원본: 앱·테스트 파일 42개(수정 34, 새 파일 8)를 services와 같은 내용으로 맞췄다. `README.md`와 `docs/templates/{block6,daily,mandalart}.md`에는 모바일 변경 부분만 패치했다. 원본에만 있는 보고서 링크는 그대로 두었다. `AGENTS.md` Design System에는 services `CLAUDE.md`의 터치·iPhone·홈 화면 앱 결정을 요약해 넣었다(홈 버튼은 Work resumption에 추가)

## 동작 변화

| 항목 | 이전 | 이후 |
|---|---|---|
| 원본 앱 | 모바일 개선 없음 | 터치 44px, safe-area, keyboard inset, 설치 manifest·아이콘·안내, Block6 `옮기기…`, 사이드바 `홈`, 모바일 만다라트 개요/상세(빈 칸은 그 자리에서 입력, 정중앙 칸은 늘 인라인 입력) |
| services 앱 | main에 모바일 개선 없음 | 위와 같음 (핸드오프에만 있던 내용) |
| API·저장·인증 | — | 변경 없음 (양쪽 코드 동일) |

## 의도적으로 남긴 차이

| 파일 | 이유 |
|---|---|
| services 전용: `CLAUDE.md`, `IMPORT-MANIFEST.json`, `deploy.conf`, `.gitattributes`, `infra/deploy/home/**`, `infra/deploy/k8s/overlays/home/**` | 홈서버 배포·monorepo 전용 파일. import 당시 기록인 manifest는 수정하지 않았다 |
| import 때 맞춤 수정된 파일 18개 (`.gitignore`, 배포·저장소 문서, `public.env`, 배포 스크립트, `README.md`, 템플릿 문서 4개) | 저장소마다 다른 주소·경로를 쓰고, services에는 없는 보고서 링크를 뺐다. 모바일 변경 부분만 양쪽에 같게 넣었다 |
| `gradlew.bat`(services는 CRLF), `infra/deploy/README.md`(home overlay 행) | services의 `.gitattributes`·홈 배포 설정 |
| 원본 전용: `AGENTS.md`, 기획·보고서·이미지 문서, `artifacts/` | 1단계에서는 services에 복사하지 않았다 → **2단계에서 철회하고 반영함**(`artifacts/` 생성물만 제외) |

## 실제 검증 (services 통합 경로, 최종 소스)

| 검사 | 결과 |
|---|---|
| `tsc --noEmit` app / e2e | exit 0 / exit 0 |
| eslint 변경 파일 41개 | exit 0 |
| `next build` (standalone, 배포 Dockerfile과 같은 명령) 1회 | exit 0 |
| standalone 서버 127.0.0.1:3687, `AUTH_ENABLED=false` | runtime-config 200, `/manifest.webmanifest`·`/apple-icon`·`/icons/icon-{192,512}.png` 200 |
| Playwright `e2e/ux-foundation` (mobile-webapp 17 + ux-foundation 33). 브라우저에서 가로챈 가상 인증·DB·AI 사용 | **50 passed** |

원본은 같은 앱 파일의 해시가 일치해서 다시 빌드하지 않았다. API 코드는 바뀌지 않았으므로 API 회귀도 실행하지 않았다. 서버는 끝난 뒤 종료했다.

## 한계

- Chromium 에뮬레이션만 사용했다. 실제 iPhone(Safari, 홈 화면 앱의 OAuth 복귀, 화상 키보드, safe-area 값)과 WebKit은 확인하지 않았다
- 이모지가 있는 정중앙 칸에서 이모지가 두 번 보이는 문제가 남아 있다(이전 모바일 보고에 적힌 비차단 시각 문제). 이번 통일 범위가 아니어서 고치지 않았다
- 원본 `CLAUDE.md`(gitignore 대상, 로컬 파일)는 바꾸지 않았다

## 2단계 — 로컬 문서·관리 파일 전체 반영

사용자 추가 요청: "로컬에 있는 코드들도 반영해줘 docs까지 싹 다". 1단계의 "기획 문서·이미지는 원본에만 둔다"는 원칙을 철회했다. 원본 작업 트리 전체(`git ls-files -co --exclude-standard`)를 services 사본에 반영했고, services에만 있던 유효한 내용은 원본에도 넣었다.

```
원본 전용 104개 (docs 전체·기획·시안 이미지·세션 보고·가이드·KVM 운영 가이드*)  ──▶ services
services 전용 홈 배포 11개 (infra/deploy/home, overlays/home)                    ──▶ 원본
양쪽이 달랐던 19개 ── 병합본 하나로 맞춤 ──▶ 양쪽
                                      결과: 공유 파일 430개 해시 동일, 예외 6개
* KVM 운영 가이드 12개는 양쪽 로컬에만 두고 게시하지 않는다 (아래 "게시 제외")
```

### 병합 규칙

| 대상 | 처리 |
|---|---|
| import 때 services에서 링크를 지운 문서 (템플릿 4, ui-ux-review, research, account-storage 등) | 보고서가 이제 양쪽에 있으므로 원본 링크를 되살렸다 |
| services에 더 새로운 사실이 있는 문서 | services 내용을 택했다. 공개 주소 `plannet.mhd-mhd.duckdns.org`(이전 `plannet-lab`은 callback 등록만 유지), 2026-10-05 callback 등록, HTTP-01과 `default-deny-ingress` 주의, 홈 overlay 행 |
| "저장소 루트" / "`apps/plannet` 폴더" 표현 | 한 문장으로 맞췄다: "Plannet 프로젝트 루트(services 모노레포에서는 `apps/plannet`)" |
| `infra/deploy/scripts/{check-public,lib,snapshot-source}.sh` | services 쪽 수정(`set -e` 안전한 `|| true`, git 범위 `-- .`)이 단일 저장소에서도 같게 동작해 양쪽에 적용했다. 주석은 중립 표현으로 고쳤다 |
| `overlays/production/public/public.env` | 원본도 services 값(`plannet.mhd-mhd.duckdns.org`)으로 맞췄다. 공유 문서가 공개 주소를 하나로 적고 있고, 이전 값은 다른 곳에서 쓰지 않으며 배포된 적도 없다 |
| `README.md` | 본문을 하나로 맞췄다. 원본 위치·services 위치를 함께 안내하고, 모노레포 전용 내용은 새 공유 문서 [services-monorepo](../guides/services-monorepo.md)로 옮겼다 |
| `AGENTS.md` | 양쪽 동일. services 루트 `CLAUDE.md`(브랜치·PR·한국어 커밋)와 충돌하는 부분은 "커밋·push·PR·병합은 사용자 명시 요청 때만"으로 해석해 적었다. 모바일 디자인 결정은 services `CLAUDE.md`에서 빠짐없이 옮겼다(manifest id·scope, keyboard inset 이유) |
| services `apps/plannet/CLAUDE.md` | 모바일 결정 블록을 `AGENTS.md`·services-monorepo 안내로 대체했다. 구조·경계·확인 절차는 유지하고, 같은 내용을 services-monorepo 문서에도 넣어 원본에 보존했다 |

### 남긴 차이 (정확한 이유)

| 파일 | 이유 |
|---|---|
| `deploy.conf` (services만) | main 병합 시 공용 워크플로가 읽는 자동 배포 선언. 원본에는 의미가 없고, 두면 배포 대상처럼 오해할 수 있다 |
| `IMPORT-MANIFEST.json` (services만) | 2026-10-05 가져오기 당시 기록이다. 현재 동기화 증거로 바꾸지 않는다 |
| `CLAUDE.md` | services에서는 추적하는 서비스 안내, 원본에서는 gitignore된 개인 로컬 파일이다. 같은 경로를 다른 용도로 쓴다. 원본 파일은 범위 밖이라 읽거나 바꾸지 않았다 |
| `.gitignore` | 원본만 `CLAUDE.md`를 무시한다(위 이유). 나머지 줄은 같다 |
| `.gitattributes` (services만) | 모노레포의 줄바꿈 고정 정책. 원본에 넣으면 기존 체크아웃 정규화가 바뀐다 |
| `gradlew.bat` | 내용은 같고 줄바꿈만 다르다(services `.gitattributes`의 `*.bat eol=crlf`) |

### 제외한 파일

- **게시 제외(로컬 보존):** `docs/guides/kvm/**` 12개(회사 인프라 메모). 사용자가 "KVM 문서만 제외"를 선택했다. 원본 저장소가 Public이라 회사 인프라가 공개되지 않게 하려는 것이다. 삭제하지 않았고, 양쪽 로컬 사본은 같은 내용이다. 실수로 포함되지 않도록 양쪽 `.gitignore`에 같은 줄 `/docs/guides/kvm/`을 넣었다
- 생성 산출물(게시에서도 제외): `artifacts/`(검증 결과 2개), `node_modules`, `.next`, `build`, `tsbuildinfo`, `test-results`, 캐시, `.DS_Store`
- gitignore된 로컬 파일. 내용은 읽지 않았다: `apps/web/.env.local`, `k8s/local/`(로컬 Secret 포함), `.local-backup/`, `infra/storage/.local/`, `.claude/`, `.idea/`, `.gradle/`, 원본 `CLAUDE.md`·`ROADMAP.md`(개인 로컬 메모, 현재 로드맵은 추적 중인 `docs/roadmap-status.md`)
- `docs/assets` 시안 이미지는 생성물이 아니므로 모두 포함했다(PNG 23)

### 확인

| 검사 | 결과 |
|---|---|
| 비밀값 패턴 검사 (값은 출력하지 않음) | 4건 감지, 모두 오탐: KVM 재현 스크립트의 가상 토큰(`example.invalid`), 홈 배포 스크립트의 k8s Secret **이름**. 실제 비밀값 없음 |
| 공유 해시 비교 (`full-local-sync/shared-hash-manifest.json`) | 동일 430, 의도한 예외 6, 생성물 제외 2, **불일치 0**. 로컬 통일 기준이며 KVM 12개를 포함한다. 게시 범위는 이 중 KVM 12개를 뺀 418개 + 예외 파일 각 저장소 버전(`publication-exclusions/publish-exclusions.json`) |
| 문서 링크·이미지 (md·html 99개씩) | 새로 깨진 링크 0. 남은 12개는 이전부터 있던 것: KVM 가이드가 다른 로컬 저장소를 절대 경로로 가리킨다. 이 사본 밖이라 이 작업과 무관하다 |
| 바뀐 배포 스크립트 | `bash -n` 통과. `snapshot-source.sh`를 양쪽에서 실제 실행: exit 0, 비밀 파일 유출 검사 통과, 범위 정상(원본 prefix 없음, services `apps/plannet/`) |
| 앱 코드 | 이번 확장에서 `apps/`·의존성·빌드 입력 변경 없음(230개 해시 동일). 1단계 최종 빌드·브라우저 QA 50 passed를 그대로 근거로 쓴다. 빌드·e2e는 다시 실행하지 않았다 |

### 주의

- 사용자가 양쪽 저장소의 로컬 코드·docs에 대해 커밋·push·PR·병합을 승인했다("둘 다 pr 머지까지해줘"). 단, KVM 운영 가이드(`docs/guides/kvm/`)는 이후 사용자 결정("KVM 문서만 제외")에 따라 게시 범위에서 뺐다. 양쪽 로컬에는 그대로 두고 `.gitignore`로 막는다. 개인 운영 문서 등 나머지 docs는 게시 범위에 들어간다
- 해결: `infra/deploy/home/README.md`가 삭제된 `deploy-plannet.yml`을 가리키던 부분을 실제 공용 `deploy.yml` + `deploy.conf` 기준으로 고쳤다. 수동 배포는 `-f services=plannet`만 쓰고, 배포는 services `main` 병합 때만 일어난다(원본 `main` 병합은 배포하지 않음)
