# 최신 코드 HTTPS·PostgreSQL 리허설

2026-09-28 · **완료** · 기준 `3e08caa` + 현재 미커밋 소스. [실행 계획](../https-rehearsal-plan.md) · [로드맵](../roadmap-status.md)

**최종 HTTPS 브라우저 검사 24개와 실제 PostgreSQL API 검사 56개가 통과했다.** 로그인 랜딩·DB 중심 자동 저장·새로고침 복구·조건부 조회·V3 영수증 축소를 실제 Web/API 이미지로 확인했다. Google·AI는 대역이며 자체 서명 인증서를 사용했다. 홈서버·공인 TLS·실제 Google/AI 검증은 남아 있다.

## 결과

| 대상 | 확인한 내용 | 결과 |
|---|---|---|
| HTTPS 진입점 9개 | HTTP 전환, 경로 분리, 보안 헤더·쿠키, 전달 헤더 위조, 미인증·교차 출처·공용 백업 차단, 서비스 격리 | 통과 |
| 인증·AI 흐름 3개 | 로그인·AI 응답·한도·CSRF·로그아웃, 동의 거부, API 장애 시 차단·재로그인 | 통과 |
| 로그인 랜딩 2개 | 로그인 전 가상 브라우저 기록 미노출·자동 이전 없음, 인증/DB 확인 실패 시 차단, 계정 이메일·360px 화면·로그아웃 랜딩 | 통과 |
| 서버 저장·복구 10개 | DB 권한·접근 제한, 기기 간 복원·계정 격리, 충돌 초안, 응답 유실, 저장 대기 중 새로고침, 전송 중 후속 수정, 임시 보관 차단, ETag, 영수증 재시도, DB/API 장애·로그아웃 보호 | 통과 |
| 최종 브라우저 합계 | 24 passed / 0 failed / 0 skipped / 0 flaky, 2.3분. 자동 재시도 없음 | **통과** |
| API·실제 PostgreSQL | 스냅샷을 일회용 PostgreSQL에 연결. 최종 소스의 API·빌드 입력이 검증한 입력과 동일함을 해시로 확인 | **56 passed / 0 failed / 0 skipped** |
| 배포 검사 | local-verify 정책·스키마 27개, 비관리자 DB 역할, migration 1·2·3 성공·실패 이력 0, 빌드/기동 이미지 일치 | 통과 |
| 검증 도구 | 정책 변형 회귀 4개, 정리 스크립트 회귀 4개, E2E strict TypeScript 검사 | 통과. infra E2E는 ESLint 적용 범위 밖 |

이미지 빌드 시 기본 API 테스트 실행은 56개 중 DB 검사 18개를 건너뛴다. 위 **56개 전부 통과**는 실제 DB 연결을 별도로 제공한 실행 결과다. 이전 17개 리허설, 앞선 167개 회귀, 이번 단독 재검증은 최종 24개에 합산하지 않는다.

## V2 → V3 데이터 보존

기존 전용 검증 DB의 가상 데이터에 추가 저장을 수행하고, 백업·해시·원래 성공 응답을 확보한 뒤 최신 API를 배포했다.

| 비교 대상 | V2 이전 | V3 이후 | 확인 |
|---|---:|---:|---|
| 사용자 | 2 | 2 | 전체 행 해시 동일 |
| 플랜 레코드 | 7 | 7 | 내용·버전·삭제 상태를 포함한 전체 행 해시 동일 |
| 저장 영수증 | 10 | 10 | ID·요청 해시·시각·응답 메타데이터 해시 동일 |
| 영수증 JSON 텍스트 합계 | 9,665 bytes | 1,827 bytes | 약 81% 감소. 테이블 전체 디스크 크기와 구분 |
| 플랜 본문을 포함한 영수증 | 10 | 0 | 중복 본문 제거 |

V3 이후 해당 플랜을 한 번 더 수정한 상태에서도 V2 때의 요청을 HTTPS로 재전송하면 **원래 ACK가 그대로 반환**되고 현재 버전 2는 유지됐다. 이후 브라우저 검사가 가상 기록을 추가하므로, 전체 검사 종료 후 건수는 이 업그레이드 직전·직후 비교와 구분한다.

## 실패와 수정

첫 전체 실행은 **23개 통과·1개 실패**였다. DB 장애 중 로그아웃은 저장을 최대 세 번 재시도한 뒤 거부하는데, 테스트가 기본 5초 안에 거부 안내를 요구했다. 요청 추적에서 DB 연결 대기마다 약 3초가 걸렸고, 테스트의 `finally` 복구가 남은 저장 재시도보다 먼저 실행된 것을 확인했다.

거부 안내의 대기를 60초로 늘리고 초안·쿠키 유지, 로그아웃 요청 0건을 그대로 단언했다. 해당 검사 단독 통과 후 소스 스냅샷·이미지를 다시 만들고 최종 전체 24개를 통과했다. DB 장애 중 `/me`도 DB 조회 때문에 503을 반환한다는 계약을 검사에 반영했다. 이번 리허설로 앱 기능 코드를 변경하지는 않았다.

## 소스·이미지·산출물

| 대상 | 식별자 |
|---|---|
| 소스 | 미커밋 변경을 포함한 314개 파일. 원본 스냅샷 별도 보존, 파일별 SHA-256 기록 |
| 소스 해시 목록 SHA-256 | `2ffeee45d762ec176ba1c11ac0a3aece575461827bb310bbbf61fd1235eb0c8b` |
| Web 이미지 | `sha256:68b128380cbd24325c76678a19577c9179a3668e8f393df5be048fd690a0f2c1` |
| API 이미지 | `sha256:51075016f16653a7d56c8175107d060cbc71dded94c77c78f2cd34b19c16b051` |

kind 노드에 적재된 이미지와 실제 Pod의 이미지 참조를 대조했으며, 장애 시험의 Pod 재생성 후에도 일치했다. 결과 문서 갱신은 검증 뒤 수행했으며 런타임·테스트 소스는 위 스냅샷과 같다. 스냅샷 도구에 파일 해시 기록을 추가했고, 배포 검사는 현재 소스의 migration 전체 목록과 DB 성공 이력의 정확한 일치를 요구하도록 보완했다.

실행 폴더: `/private/tmp/plannet-release-rehearsal-20260927/runs/latest-https-20260928-113804`

| 근거 | 실행 폴더 안 위치 |
|---|---|
| 최종 소스·이미지 | `verified-source/`, `artifacts/source-sha256.json`, `artifacts/images.txt`, `artifacts/running-image-ids.json` |
| 최종 브라우저 결과·화면 | `e2e.log`, `artifacts/e2e/results.json`, `artifacts/e2e/report/`, `artifacts/e2e/test-results/` |
| 최초 실패·단독 재검증 | `e2e-attempt-1.log`, `artifacts/e2e-attempt-1/`(trace 포함), `e2e-target.log`, `artifacts/e2e-target/` |
| 실제 DB API 검사 | `artifacts/api-postgres-results/`, `api-postgres-result.json`, `artifacts/api-test-source-match.json` |
| 업그레이드 보존 | `state-before.json`, `state-after-upgrade.json`, `synthetic-v2-before.dump`, `upgrade-replay-result.json` |
| 종료 상태·로그 | `state-final.json`, `artifacts/cluster-final/`, `artifacts/cluster-final/credential-scan.json` |

## 종료 상태·다음 단계

- 전용 `plannet-verify` 클러스터를 유지했다. Web/API/DB 각 1개 Ready, 기존 PVC UID 유지·Bound. 검증 DB는 가상 사용자 2명·레코드 33개·영수증 56개이며 본문 중복 영수증은 0개다. 별도 API 검사에 사용한 일회용 DB는 정리했다.
- 기본 kube context는 `docker-desktop` 그대로다. 실제 서비스의 3000·3001·18180·15432 리스너 PID가 모두 작업 전과 같고 Web 설정·API health가 200이다. 실제 사용자 DB·브라우저·DuckDNS·Google 설정은 변경하지 않았다.
- 수집한 최종 리소스·이벤트·Web/API/DB/대역 로그 6개에서 검증 DB 비밀번호와 대역 비밀값이 검출되지 않았다.
- 다음은 **홈서버의 영속 디스크·사설 DB 연결·백업 위치 확정 → 새 DB 복원·데이터 대조 → 공인 TLS·실제 Google/AI 검증 → 제한 공개**다. 로컬 kind의 PVC·네트워크 정책 검증을 홈서버 환경 검증으로 간주하지 않는다.

테스트 보완은 요청대로 Claude Opus에 맡겼고 총괄이 검토·배포·실행·실패 진단·인수를 담당했다. 커밋·푸시·공개 배포는 수행하지 않았다.
