# PostgreSQL 로컬 실행과 홈서버 이전

2026-09-26 기준 Plannet의 서버 저장소는 PostgreSQL이다. 초기에는 현재 컴퓨터에서 실행하고, 홈서버를 준비하면 논리 백업으로 이전한다. 공개 웹 주소는 `https://plannet.mhd-mhd.duckdns.org`이며(이전 주소 `plannet-lab.duckdns.org`는 Google callback 등록만 유지) 데이터베이스 주소로 사용하지 않는다. 저장 API 계약은 [planner-storage-v1](contracts/planner-storage-v1.md), 공개 인증·라우팅 정책은 [배포 준비 문서](deployment-readiness.md)를 따른다.

## 저장 구성

| 항목 | 기본값 / 역할 |
|---|---|
| 이미지 | `postgres:18.6-bookworm` — 실제 pull 및 PostgreSQL 18.6 기동 확인 |
| Compose | `infra/storage/compose.yaml` |
| 프로젝트 / 컨테이너 | `plannet-storage` / `plannet-storage-db-1` |
| 볼륨 | `plannet-storage-pg18` — PostgreSQL 데이터 전용 named volume |
| 마운트 | `/var/lib/postgresql` — 이미지의 PostgreSQL 18 데이터 경로 수용 |
| 호스트 포트 | `127.0.0.1:15432`, 컨테이너 내부 `5432` |
| 초기 DB / 앱 역할 | `plannet` / `plannet_app` |
| 관리 역할 | `postgres` — 초기화·새 복원 DB 생성 전용 |
| 비공개 파일 | `infra/storage/.local/default/` — 디렉터리 700, 파일 600 |

이미지는 `platform`을 강제하지 않으므로 Apple Silicon과 x86 Linux에서 각 호스트에 맞는 이미지를 사용한다. PostgreSQL 18 공식 이미지의 데이터 루트에 named volume을 마운트하며 컨테이너를 다시 만들 때도 데이터를 유지한다. `initdb` 스크립트는 빈 볼륨을 처음 시작할 때만 실행된다. [공식 이미지 설명](https://hub.docker.com/_/postgres), [Docker 볼륨 문서](https://docs.docker.com/engine/storage/volumes/).

앱 역할은 자기 DB의 소유자로 Flyway migration을 수행하지만 `SUPERUSER`, `CREATEDB`, `CREATEROLE`, `REPLICATION`, `BYPASSRLS` 권한이 없다. 네트워크와 로컬 소켓 모두 SCRAM 비밀번호 인증을 사용한다. 관리 비밀번호를 앱에 전달하지 않는다.

Compose의 파일 secret은 호스트 파일의 권한과 UID를 유지할 수 있다. 시작 스크립트는 600인 원본 secret을 컨테이너의 private tmpfs로 복사해 `postgres` 사용자만 읽도록 한다. 비밀번호를 Compose의 직접 환경변수나 명령행 인수에 넣지 않는다. 이 파일들은 해당 컴퓨터의 Docker 권한을 가진 운영자가 접근할 수 있다.

## 처음 실행

필수 도구: Docker Engine/Desktop와 Compose v2 이상, Bash, Python 3.9 이상. Compose의 `up --wait` 지원 버전이 필요하다. 모든 명령은 Plannet 프로젝트 루트(services 모노레포에서는 `apps/plannet`)에서 실행한다.

```sh
./infra/storage/db.sh init
./infra/storage/db.sh up
./infra/storage/db.sh status
./infra/storage/db.sh run -- ./gradlew --no-daemon :apps:api:bootRun
```

`init`은 서로 다른 무작위 관리·앱 비밀번호를 만들고, 이미 존재하는 설정을 덮어쓰지 않는다. `up`은 자기 프로젝트 외의 기존 볼륨을 가져다 쓰지 않는다. PostgreSQL의 준비 상태와 실제 앱 인증, 낮은 앱 권한까지 검사한다. API의 Flyway가 애플리케이션 테이블을 생성한다. 인증 설정은 기존 API 실행 설정과 함께 제공한다.

`run`은 아래 값을 자식 프로세스 환경으로 전달한다. 같은 값의 private 파일은 `infra/storage/.local/default/api.env`에 있다. 이 파일을 출력·커밋하거나 프런트엔드의 `NEXT_PUBLIC_*` 변수에 복사하지 않는다.

```dotenv
PLANNET_STORAGE_ENABLED=true
PLANNET_DB_URL=jdbc:postgresql://127.0.0.1:15432/plannet
PLANNET_DB_USERNAME=plannet_app
PLANNET_DB_PASSWORD=<generated locally; never commit>
```

다른 로컬 DB가 포트를 쓰고 있다면 `init --port 15434`를 처음에 지정한다. 별도 인스턴스는 `./infra/storage/db.sh --profile rehearsal init --port 15434`처럼 독립 프로필을 만든다. 이후 명령에도 같은 `--profile rehearsal`을 붙인다. 기존 볼륨에서 비밀번호 파일만 재생성하면 DB 내부 비밀번호와 어긋나므로 기존 `.local` 파일을 지우고 `init`을 다시 실행하지 않는다.

## 중지와 재시작

```sh
./infra/storage/db.sh stop
./infra/storage/db.sh up
```

`stop`은 해당 DB만 중지하고 볼륨을 남긴다. `restart: unless-stopped`로 Docker 재기동 뒤에도 실행 상태를 복구한다. Docker Desktop을 재설정하거나 볼륨을 지우면 데이터가 사라질 수 있으므로 볼륨 자체를 백업으로 취급하지 않는다. `down -v`, volume prune 또는 데이터 디렉터리의 수동 삭제는 운영 절차에 포함하지 않는다.

## 백업과 복구

```sh
./infra/storage/db.sh backup
# 특정 경로가 필요하면 해당 경로의 상위 디렉터리를 먼저 준비한다.
./infra/storage/db.sh backup --output /absolute/private/path/plannet-final.dump
```

컨테이너와 같은 PostgreSQL 버전의 `pg_dump --format=custom`을 앱 역할로 실행한다. 기본 백업 경로는 `.local/default/backups/`이고 파일은 600이다. 동일 경로의 기존 파일이나 심볼릭 링크를 덮어쓰지 않으며 완료 뒤 SHA-256을 출력한다. DB 내부 스키마·데이터·sequence 값이 포함되고 클러스터 역할·비밀번호는 포함하지 않는다. custom archive는 다른 CPU 아키텍처로 이전할 수 있다. [pg_dump 공식 문서](https://www.postgresql.org/docs/18/app-pgdump.html).

이 명령은 관리자용 전체 계정 DB 백업이다. 브라우저의 사용자별 JSON 내보내기와 다르며 공개 `/api/backup` 기능으로 제공하지 않는다. 작은 개인 서비스의 기본 운영 기준은 매일 한 번, 앱 migration 직전, 이전 직전 백업이다. 복구 가능한 시점은 마지막 백업까지다. 더 짧은 데이터 손실 허용 시간이 필요하면 WAL 보관과 시점 복구를 별도로 설계한다.

로컬 백업 한 개로 끝내지 말고 **별도 장치의 암호화된 저장소**에 복사한다. 홈서버와 같은 디스크에 있는 다른 디렉터리는 장치 고장 대비 사본이 아니다. 예를 들어 일별 7개와 주별 4개를 남기되 삭제 자동화는 검증된 새 백업과 별도 장치 사본이 확보된 뒤 운영자가 설정한다. 모든 계정의 자료가 들어 있으므로 저장소를 공개하거나 웹 경로에 놓지 않는다.

복구는 신뢰하는 직접 생성 백업에만 실행한다. dump 복원은 그 안의 SQL을 실행한다. 새 DB를 직접 생성한 뒤 앱 역할로 하나의 트랜잭션 안에서 복원하며 `--clean`을 사용하지 않는다. [pg_restore 공식 문서](https://www.postgresql.org/docs/18/app-pgrestore.html).

```sh
./infra/storage/db.sh restore /absolute/private/path/plannet-final.dump --target plannet_recovered
./infra/storage/db.sh api-env --database plannet_recovered
# 검증 후 해당 DB를 사용하는 API 실행
./infra/storage/db.sh run --database plannet_recovered -- ./gradlew --no-daemon :apps:api:bootRun
```

`--target` DB가 이미 있으면 비어 있어도 거부한다. 실패한 복원 DB도 자동 삭제하지 않으므로 상태를 확인하고 다른 새 이름으로 재시도한다. 기본 `api.env`와 원본 `plannet` DB는 바꾸지 않는다. `api-env`는 `api-plannet_recovered.env`를 별도로 생성하며 같은 파일이 있으면 거부한다.

복원 후에는 원본·복원본의 테이블별 건수와 주요 사용자별 플랜, 삭제 표식, 버전, 날짜 및 JSON 내용을 비교한다. 앱을 원본과 같은 버전으로 실행해 로그인 후 읽기·쓰기·다른 계정 격리를 확인한다. 기록이 없는 초기 DB의 성공만으로 운영 데이터 복구를 검증했다고 판단하지 않는다.

## 홈서버 이전 순서

1. **대상 준비.** 홈서버에 같은 소스 버전, Docker/Compose, Python을 준비하고 전용 영구 디스크의 Docker 볼륨 저장 위치·여유 용량·복구 방법을 확인한다. 저장소 경로가 바뀌므로 로컬 `.local/`을 복사하지 않는다. 홈서버에서 `init`, `up`을 실행해 새 볼륨과 새 비밀번호를 만든다. 로컬과 같은 PostgreSQL 18.6으로 먼저 이전한다.
2. **예행연습.** 서비스가 동작하는 동안 만든 백업으로 홈서버의 새 DB `plannet_rehearsal`에 복원한다. 데이터·앱 기능·계정 격리를 확인하고 걸린 시간을 기록한다. 이 예행연습 DB를 최종 복원 대상으로 재사용하지 않는다.
3. **쓰기 정지.** 사용자 편집 저장이 끝나게 한 뒤 로컬 API와 다른 DB 쓰기 프로세스를 중지한다. PostgreSQL은 덤프를 위해 계속 실행한다. 점검 동안 브라우저가 새 데이터를 저장하지 않도록 서비스 접근을 막는다. 그 후 `backup --output <새 final 파일>`을 실행한다. 실행 중 덤프도 일관되지만 덤프 이후 새 쓰기는 최종본에 들어가지 않으므로 cutover 전에 쓰기 중지가 필요하다.
4. **안전한 전달.** 사설망/VPN/SSH의 `scp` 등으로 final dump를 홈서버의 private 디렉터리에 전달한다. 다른 장치의 암호화된 백업 사본도 보존한다. 송신·수신 파일의 SHA-256을 비교한다. 예: `python3 -c 'import hashlib,sys; print(hashlib.sha256(open(sys.argv[1], "rb").read()).hexdigest())' /private/path/plannet-final.dump`.
5. **새 최종 DB로 복원.** 홈서버에서 `restore /private/path/plannet-final.dump --target plannet_live_20260926`을 실행한다. 이미 존재하는 DB를 덮어쓰지 않는다. 같은 앱 버전을 연결해 위 복원 검증을 반복한 뒤 새 `api-env --database plannet_live_20260926`을 만든다.
6. **연결과 공개 전환.** API에 홈서버에서 생성한 앱 계정과 복원 대상 JDBC URL을 전달하고 `PLANNET_STORAGE_ENABLED=true`를 명시한다. HTTPS gateway와 OAuth redirect origin을 `https://plannet.mhd-mhd.duckdns.org`에 맞춘 뒤 계정별 저장·다른 브라우저 재접속·재시작 영속성을 확인한다. 이후 웹 트래픽을 홈서버로 전환한다. 공유기에서 공개하는 것은 필요한 웹 포트뿐이다. PostgreSQL의 `5432`와 호스트 `15432`는 포워딩하지 않는다.
7. **확인과 되돌리기.** 원본 DB와 final dump는 확인 기간 동안 보존하고 원본의 쓰기는 계속 막아 두어 두 DB가 따로 변경되지 않도록 한다. 홈서버에 새 쓰기가 들어오기 전에는 연결을 원본으로 되돌릴 수 있다. 새 쓰기를 받은 뒤라면 먼저 홈서버 쓰기를 중지하고 그 DB를 다시 백업·검증하여 반영해야 한다. 이전 원본으로 즉시 되돌리면 새 데이터가 유실된다.

### API 실행 위치별 주소

| API 위치 | PostgreSQL 연결 |
|---|---|
| Compose DB와 같은 호스트의 Java 프로세스 | 생성된 `jdbc:postgresql://127.0.0.1:15432/<db>` |
| 같은 Docker 네트워크의 API 컨테이너 | `jdbc:postgresql://db:5432/<db>`; API를 해당 private 네트워크에 연결 |
| Kubernetes API Pod | 해당 배포의 private DB Service/사설 endpoint와 Secret을 제공해야 함 |

컨테이너나 Pod의 `127.0.0.1`은 그 컨테이너/Pod 자신이다. 호스트용 `api.env`의 JDBC URL을 Kubernetes에 그대로 적용하지 않는다. 이 Compose는 호스트 실행용이며 기존 Kubernetes 공개 배포를 자동 변경하지 않는다. 홈서버를 Kubernetes로 운영한다면 별도의 DB 영구 볼륨/Service와 백업 저장소를 마련하고 DB에 public LoadBalancer, NodePort, 공개 DNS를 붙이지 않는다.

## 검증과 업데이트

```sh
python3 infra/storage/verify.py
```

전용 `15433`과 새로운 무작위 프로젝트·볼륨만 사용한다. 비밀번호 인증 거부, 앱 권한, 비밀 파일 권한, localhost 바인딩, stop/start 영속성, custom dump 복원 후 행·Unicode·JSON·삭제 표식·sequence·소유자 일치, 기존 DB/백업 덮어쓰기 거부를 검사한다. 만든 검증용 컨테이너·네트워크·볼륨만 정리하고 private JSON 보고서와 샘플 dump는 `.local/verify-*/`에 보존한다. 실제 API migration·인증/계정별 저장 테스트는 API/브라우저 검증에서 별도로 수행한다.

PostgreSQL patch 버전을 바꿀 때는 백업 후 새 이미지로 격리 복원 검증하고 앱 검증을 통과한 다음 Compose의 정확한 태그를 갱신한다. major 버전은 기존 볼륨의 이미지 숫자만 변경하지 않는다. 새 major 전용 볼륨을 만들고 공식 업그레이드 절차 또는 검증된 dump/restore를 사용한다. [PostgreSQL 버전 정책](https://www.postgresql.org/support/versioning/).

## 계정 이메일(V4) 운영 유의점

V4는 `plannet_user`에 nullable `email VARCHAR(320)`과 형식 CHECK만 추가한다(기존 행·플랜·영수증 변경 없음, 기존 계정은 NULL). 값은 다음 검증된 로그인 뒤 `/me`·planner 요청에서 채워진다. 이전 API는 이 열을 읽지 않으므로 API만 되돌려도 호환된다. 이메일은 개인정보이므로 dump 보관·공유 기준은 기존 계정 데이터와 같다. [보고](session-reports/account-email.md)

## 저장 비용 개선(V3) 운영 유의점

V3는 `planner_commit_receipt.response`의 플랜 본문 사본만 제거하고 요청 ID·해시·원래 버전/시각 등 메타데이터를 보존한다. `planner_record`의 실제 플랜·계정은 바꾸지 않는다. 저장 재시도 응답은 같은 해시의 요청 본문으로 복원한다. 지연된 재시도 보호를 위해 영수증 행을 임의로 기간 삭제하지 않는다.

적용 전 비공개 dump를 만들고, 별도 검증 DB에서 V2→V3와 과거 요청 재시도를 확인한다. 적용 이후에는 `format: 2` 영수증을 이해하는 API를 유지해야 하므로 **V3 이전 API 바이너리만 되돌리면 안 된다.** 롤백이 필요하면 호환 API를 사용하거나 쓰기를 멈춘 뒤 백업을 새 DB에 복원·검증한다. 백업 이후 저장분이 있는 상태에서 과거 백업으로 즉시 되돌리지 않는다. 영수증 JSON의 논리적 크기 감소와 실제 디스크 회수는 다르며, `VACUUM FULL` 같은 잠금 작업은 자동 실행하지 않는다.
