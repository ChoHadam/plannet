# Plannet PostgreSQL

로컬 컴퓨터와 홈서버에서 같은 PostgreSQL 18 구성을 사용한다. 필요한 도구는 Docker Engine/Desktop + Compose v2 이상, Bash, Python 3.9 이상이다. `psql`과 PostgreSQL을 호스트에 설치할 필요는 없다.

Plannet 프로젝트 루트(services 모노레포에서는 `apps/plannet`)에서 실행:

```sh
./infra/storage/db.sh init
./infra/storage/db.sh up
./infra/storage/db.sh run -- ./gradlew --no-daemon :apps:api:bootRun
```

`init`은 한 번만 실행한다. 기본 주소는 `127.0.0.1:15432/plannet`이며 API 환경 파일은 `.local/default/api.env`에 생성된다. 기존 DB가 없을 때 앱 역할과 DB를 만들고, 앱 스키마는 API의 Flyway가 관리한다.

```sh
./infra/storage/db.sh status
./infra/storage/db.sh backup
./infra/storage/db.sh restore /absolute/path/plannet.dump --target plannet_recovered
./infra/storage/db.sh run --database plannet_recovered -- ./gradlew --no-daemon :apps:api:bootRun
./infra/storage/db.sh stop
```

복원 대상은 반드시 새 DB 이름이어야 한다. `stop`은 데이터를 보존한다. `run`은 해당 명령의 환경변수만 설정하고 비밀번호를 출력하지 않는다. 다른 프로세스에 전달할 환경 파일이 필요하면 `api-env --database plannet_recovered`를 사용한다.

실제 DB 검증:

```sh
python3 infra/storage/verify.py
```

전용 `127.0.0.1:15433`과 무작위 프로젝트·볼륨을 사용한다. 새로 만든 검증용 컨테이너·볼륨만 정리하며 보고서와 샘플 백업은 `.local/verify-*/`에 남긴다. 포트가 사용 중이면 `--port 15434`로 바꾼다.

이전, 백업, 복구 및 홈서버 연결은 [PostgreSQL 운영 문서](../../docs/postgresql-operations.md)를 따른다. 이 디렉터리의 `.local/`은 Git 및 Docker 빌드 컨텍스트에서 제외한다.
