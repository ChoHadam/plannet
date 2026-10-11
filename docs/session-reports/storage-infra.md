# Storage infrastructure — 2026-09-26

## 변경 범위

- `infra/storage/compose.yaml`: PostgreSQL `18.6-bookworm`, host `127.0.0.1:15432`, 전용 named volume, SCRAM 인증, 파일 secret, healthcheck, 정상 종료 대기, 로그 용량 제한.
- `infra/storage/entrypoint.sh`, `initdb/10-plannet.sh`: Linux 호스트 secret 파일 UID 차이를 private tmpfs 복사로 처리. 별도 `plannet_app` 역할에 일반 DB 소유권만 부여.
- `infra/storage/db.sh`, `manage.py`: `init`, `up`, `status`, `stop`, `backup`, `restore`, `api-env`, `run`. 비밀번호 안전 생성, 기존 설정/백업/DB 덮어쓰기 거부, 신규 DB에만 단일 트랜잭션 복원.
- `infra/storage/verify.py`: 무작위 독립 프로젝트와 port 15433에서 실제 PG 검증 후 자신이 만든 컨테이너·네트워크·볼륨만 정리.
- `infra/storage/.gitignore`, 루트 `.dockerignore`의 `infra/storage/.local/` 한 줄: 비밀 파일·DB dump·검증 결과 Git/이미지 제외.
- `infra/storage/README.md`, `docs/postgresql-operations.md`: 실행·백업·복원·홈서버 이전·공개 DB 포트 금지·별도 장치 백업·Kubernetes 연결 경계 문서화.

기존 배포 manifest/script, 앱 코드, 루트 package/README는 변경하지 않았다. 커밋·push·외부 배포는 하지 않았다.

## 실행 상태

- 공식 이미지 실제 pull 성공. 런타임 `PostgreSQL 18.6 (Debian 18.6-1.pgdg12+2)`, 실행 아키텍처 `arm64`.
- pull digest: `sha256:3725f4e2499eef5134592b3b4ab79a543ed7f8e533b05b5b637af926630f6650`.
- 기본 컨테이너 `plannet-storage-db-1` healthy, `127.0.0.1:15432/plannet`.
- 영구 볼륨 `plannet-storage-pg18`. 앱 역할 `plannet_app`은 SUPERUSER/CREATEDB/CREATEROLE/REPLICATION/BYPASSRLS 모두 false.
- private API 파일: `infra/storage/.local/default/api.env`. 네 개의 `PLANNET_STORAGE_ENABLED`/`PLANNET_DB_*` 환경변수 포함, 값은 출력하지 않음.
- private 설정 디렉터리: `infra/storage/.local/default/`. 관리·앱 password 파일 및 compose.env/config.json 포함. 파일 600, 디렉터리 700.
- 기본 DB는 새 로컬 서비스용으로 만들었으며 이 작업에서 애플리케이션 fixture/migration을 주입하지 않았다. 앱 스키마는 API Flyway가 생성한다.

## 검증

최종 실행 `python3 infra/storage/verify.py`, exit 0. report: `infra/storage/.local/verify-a2f7293e7996/verification.json`.

1. PG 시작 및 비superuser 앱 연결 성공.
2. Docker port binding이 정확히 `127.0.0.1:15433`, 비밀 파일 600, 컨테이너 inspect에 실제 비밀번호 미포함.
3. 틀린 TCP 비밀번호 접속 거부.
4. 계정별 중복 ID, 서로 다른 템플릿 ID, JSON/Unicode, version, 삭제 표식이 stop/start 후 유지.
5. 기존 dump 경로의 덮어쓰기 거부.
6. custom-format dump → 별도의 새 DB 복원 후 모든 샘플 행·sequence 값·앱 owner 일치.
7. 원본 및 이미 복원한 DB로 다시 restore 시 거부; 양쪽 데이터 불변.
8. 복원 DB용 별도 API env 생성; 기본 env 불변.

별도 검사: dangling symlink 백업 대상 거부(실제 파일 생성 없음), 시스템 DB와 SQL/경로 형태의 잘못된 DB 이름 거부, Bash 구문/파이썬 compile, `git diff --check`, 생성 비밀 파일의 `git check-ignore` 통과.

검증용 컨테이너·네트워크·볼륨은 정리했으며 private 샘플 dump/보고서만 남겼다. 기존 다른 앱·컨테이너·볼륨은 수정하지 않았다. 최초 개발 중 Compose entrypoint 지정에 따라 기본 CMD가 없어지는 문제가 있어 `command: [postgres]`로 수정했으며 최종 실제 실행과 재시작 검증에서 통과했다.

이 검증은 데이터베이스 운영 도구와 대표 저장 레코드의 복구를 검증한다. 실제 앱의 Flyway/API 계약/브라우저 저장 검증은 담당 API/Web 통합 작업에서 별도로 수행해야 한다. 홈서버 기기나 외부 domain으로의 실제 이전은 수행하지 않았다.

## 통합 명령

```sh
./infra/storage/db.sh status
./infra/storage/db.sh run -- ./gradlew --no-daemon :apps:api:bootRun
./infra/storage/db.sh backup
./infra/storage/db.sh stop
```

기본 프로필의 `init`은 이미 완료되어 다시 실행하면 안전하게 거부한다. 다른 머신에는 `infra/storage/.local`을 복사하지 않고 새로 init 후 dump를 새 DB에 복원한다.
