# services 모노레포 사본 (`apps/plannet`)

Plannet은 원본 저장소(`ChoHadam/plannet`, 개발 브랜치 `feat/web-spring-auth`)와 [`MyoungHaSong/services`](https://github.com/MyoungHaSong/services) 모노레포의 `apps/plannet`에 같은 앱 코드·테스트·문서로 있다. 이 문서는 두 곳에서 같은 내용이며, 모노레포에서만 필요한 내용을 담는다. 통일 기록: [code-unification](../session-reports/code-unification.md).

## 모노레포에서 실행

```bash
git clone https://github.com/MyoungHaSong/services.git
cd services/apps/plannet        # 모든 명령은 이 폴더 기준 (npm workspace·Gradle wrapper·배포 스크립트가 이 안에서 완결)
npm ci
```

- Windows에서 clone하면 먼저 `git config core.longpaths true`
- 모노레포 루트 `CLAUDE.md`(브랜치·PR·한국어 커밋 메시지)와 `apps/plannet/CLAUDE.md`(서비스 안내)가 있다. 커밋·push는 [AGENTS.md](../../AGENTS.md)대로 사용자 명시 요청 때만 한다

| 경로 | 내용 |
|---|---|
| `apps/web/` | Next.js 16 (App Router, `output: "standalone"`). 이 폴더(`apps/plannet`)의 `package.json`이 npm workspace 루트 |
| `apps/api/` | Spring Boot/Kotlin. `./gradlew :apps:api:...` |
| `infra/storage/` | 로컬·홈서버 PostgreSQL(Compose) `db.sh`. 접속 설정 `infra/storage/.local/`(커밋 안 함) |
| `infra/deploy/` | Kubernetes 매니페스트·검증 스크립트. namespace·리소스 이름 `plannet` 고정 |

## 지켜야 할 경계 (공개 배포)

- 공개 배포는 인증 필수 + 계정별 PostgreSQL 저장만 쓴다(DB 없으면 기동하지 않음). 브라우저 저장으로 대체하지 않는다
- 매니페스트·문서에 비밀값을 넣지 않는다. Secret은 `infra/deploy/scripts/create-secrets.sh`(홈 클러스터는 `infra/deploy/home/bootstrap.sh`)로만 만든다
- 공개 주소는 `plannet.mhd-mhd.duckdns.org`. `public.env`의 host·origin·callback 세 값은 같은 origin이어야 한다
- 클러스터 전역 설치(Gateway 컨트롤러·CRD·cert-manager)를 자동화하지 않는다

## 확인 (PR 전)

바뀐 범위에 맞는 검사만 한다([검증 정책](../verification-policy.md)).

```bash
npm run web:build                  # Web production 빌드
./gradlew :apps:api:bootJar        # API 빌드 (JDK 21)
npm --workspace apps/web exec -- playwright test e2e/auth-landing.spec.ts   # 바뀐 부분에 맞는 e2e만
infra/deploy/scripts/validate-manifests.sh production   # 매니페스트를 바꿨을 때 (PyYAML 필요)
```

## 두 저장소에서 다르게 두는 파일

| 파일 | 위치 | 이유 |
|---|---|---|
| `deploy.conf` | services만 | main 병합 시 자동 배포 선언(모노레포 공용 워크플로가 읽음). 원본에서는 의미 없음 |
| `IMPORT-MANIFEST.json` | services만 | 2026-10-05 가져오기 당시 기록. 현재 동기화 증거가 아니며 수정하지 않는다 |
| `CLAUDE.md` | services: 서비스 안내(추적) / 원본: gitignore된 개인 로컬 파일 | 같은 경로가 저장소마다 다른 용도. 공통 규칙은 둘 다 `AGENTS.md` |
| `.gitignore` | 원본만 `CLAUDE.md` 무시 | services는 `CLAUDE.md`를 추적 |
| `.gitattributes` | services만 | 모노레포 줄바꿈 고정(`*.bat` CRLF). 그래서 `gradlew.bat`은 services 체크아웃에서 CRLF |

`docs/guides/kvm/`(회사 인프라 메모)는 양쪽 로컬에만 두고 게시하지 않는다. 양쪽 `.gitignore`에 `/docs/guides/kvm/`이 있다(원본 저장소가 Public이기 때문).

홈 클러스터 배포 구성(`infra/deploy/home/`, `infra/deploy/k8s/overlays/home/`)은 양쪽에 같은 파일로 두지만 실제 배포는 services에서만 한다([home/README](../../infra/deploy/home/README.md)).
