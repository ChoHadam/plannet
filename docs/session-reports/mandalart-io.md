# 만다라트 JSON·PNG 검증 기록

2026-09-26 작업. 커밋·푸시 없음. 기존 작업 트리를 보존하고 I/O 관련 파일만 수정했다. Header와 store의 원자적 가져오기·지연 작업 보호는 총괄/AI 담당이 통합했다.

## 재현한 문제

원래 production 빌드를 별도 사본과 3650 포트에서 실행했다. 1440px 데스크톱과 393px 모바일에서 실제 `이미지 저장`을 누르면 모두 `이미지 생성 중 오류가 발생했습니다.`가 표시됐다.

- `id="mandalart-grid"`가 두 개였다. 데스크톱에서 첫 요소는 숨겨진 모바일 9칸(0×0), 모바일에서 첫 요소는 중앙 9칸뿐이었다.
- 같은 html2canvas 1.4.1을 브라우저에서 직접 호출하여 `Error: Attempting to parse an unsupported color function "oklab"`을 확인했다.
- JSON 가져오기는 `grids`가 배열인지만 확인하고 나머지를 타입 단언으로 신뢰했다.

## 변경

- `src/lib/mandalartImport.ts`: `unknown`부터 검증. 파일 2MiB, 문자열 16,384자, 깊이 12, 객체 키 64개, 배열 200개를 상한으로 둔다. 플랜 ID는 최대 128자이며 영숫자로 시작하는 영숫자·점·밑줄·콜론·하이픈만 허용한다. 아이콘은 최대 128자다.
- 정확히 9개의 고유 그리드와 각 9개의 고유 위치/셀 ID를 요구한다. 셀 ID는 기존 저장 형식인 `{gridId}-{position}`과 일치해야 한다. 순서가 섞인 셀은 위치순으로 복원한다.
- 문자열/boolean/정수 타입, hex 색상, ISO 타임스탬프, 실제 달력 날짜, 스케줄 반복·월·요일·기간을 검사한다. 현재 필드와 안전한 확장 필드는 보존하고 프로토타입 관련 키는 거부한다.
- 제목·내용·아이콘은 기존 DOMPurify 규칙으로 정리한다. 최초 버전의 category/template 누락은 annual/mandalart로 채운다. 이전 `isDaily`는 명시적 schedule이 없을 때만 daily로 보완하며, 기존 플래그/확장 필드도 보존한다. 초기 ISO 주차를 담은 백업을 위해 week 1~53을 허용한다.
- `src/lib/export.ts`: 파일을 읽기 전 크기를 확인하고 검증 성공 시에만 데이터를 반환한다. 파일 선택 취소는 null로 끝나며 숨겨진 input을 정리한다. 다운로드 URL은 브라우저가 처리한 뒤 폐기한다.
- `src/lib/mandalartImage.ts`: CSS 복제나 iframe 없이 실제 플랜을 Canvas에 그린다. 2080×2192 PNG에 81칸, 제목, 영역별 색상, 중앙 목표의 색상 대응, 완료 체크/취소선, 한국어/영문/이모지를 포함한다. 줄바꿈과 글자 크기 조정으로 내용을 맞추고 grapheme 단위로 나누어 결합 이모지가 쪼개지지 않도록 한다.
- 그리드 공통 루트만 `mandalart-grid`를 쓰고 각 화면은 고유 ID를 쓴다. 기존 2인자 exportToImage 호출도 공통 루트의 전체 데이터로 동작하며 Header는 명시적인 3번째 데이터 인자를 전달한다.
- 총괄에서 연결한 가져오기는 기존 플랜 ID를 유지하고 파일의 카테고리·기간을 복원한다. 사용자가 파일 선택/덮어쓰기 확인을 기다리는 동안 수정한 플랜은 뒤늦은 가져오기로 덮어쓰지 않는다.

## 검증

전용 설정: `apps/web/playwright.mandalart-io.config.ts`. production 사본은 OS 임시 디렉터리의 `plannet-mandalart-io`에 생성하며 .env·로컬 백업·개발 빌드·기존 테스트 산출물을 복사하지 않는다. 인증·AI·백업 관련 환경변수를 제거한다. 실제 사용자 저장소나 외부 AI는 사용하지 않는다.

```sh
cd apps/web
npx playwright test -c playwright.mandalart-io.config.ts
# 구조 검증만 실행할 때
MIO_LOGIC_ONLY=1 npx playwright test -c playwright.mandalart-io.config.ts --project validation
```

- 구조 검증 34건: 현재/구형 왕복, 확장 필드, 순서 복원, 잘못된 ID/타입/그리드/셀/색/기간/스케줄, 잘린 JSON, 크기 초과, 깊이 초과, 프로토타입 키.
- 브라우저 검증은 데스크톱/모바일 각각 JSON 다운로드·불러오기·재로드, imported 카테고리/기간, 실제 DOMPurify 결과, 잘못된 파일/파일 선택 취소/덮어쓰기 취소 시 저장소 원문 보존, 확인 중/파일 선택 중 수정 보호, 실제 PNG 다운로드를 확인한다.
- PNG 디코딩 후 81칸 모두의 기대 배경색과 글자 픽셀을 검사한다. 응답의 X-Frame-Options DENY 및 CSP frame-ancestors 'none'을 함께 확인했다.
- 최종 전체 실행 **46/46 통과** (구조 34 + 데스크톱 6 + 모바일 6). 지연 파일 선택 검사와 화면 캡처도 포함한다.
- 담당 파일 ESLint, 프로젝트 TypeScript 검사, 격리 production 빌드 통과. 첫 샌드박스 실행은 Google Fonts 네트워크 및 Turbopack 포트 바인딩 제약으로 실패했지만 승인된 확장 권한으로 실제 production 소스·폰트를 사용한 빌드/브라우저 검증을 완료했다. 임시 시스템 폰트 대체 시도는 최종 검증에 사용하지 않았다.

PNG 증거:

- `apps/web/test-results/mandalart-io/browser-PNG-download-conta-d061c-ors-under-frame-denying-CSP-desktop/mandalart.png`
- `apps/web/test-results/mandalart-io/browser-PNG-download-conta-d061c-ors-under-frame-denying-CSP-mobile/mandalart.png`
- 각 디렉터리의 `app.png`는 해당 화면 크기의 앱 화면이다.
- 두 PNG의 SHA-256은 `335f92a12153ed9b04b63dfba1146629c72e3a8074072bbcd3ac44da72009478`로 일치한다. PNG를 직접 열어 81칸, 한글/영문, 색상, 컬러 이모지, 완료 표시를 시각적으로 확인했다.

## 범위와 한계

이미지는 화면 캡처 대신 저장용 고정 레이아웃이다. 모바일에서 펼친 하위 목표와 무관하게 전체를 저장한다. 아주 긴 내용은 작은 글자로 조정되며 이모지/글꼴 모양은 OS에 따라 달라질 수 있다. PNG는 편집용 스케줄 데이터 백업을 대체하지 않으며 JSON은 스케줄을 포함한 데이터를 보존한다. 모바일 검증은 Chromium Pixel 7 에뮬레이션으로 수행했다. Safari/실제 모바일 기기의 다운로드 UI는 별도 확인하지 않았다. 패키지·lockfile·보안 헤더는 수정하지 않았다.
