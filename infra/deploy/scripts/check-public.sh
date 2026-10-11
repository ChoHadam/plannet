#!/usr/bin/env bash
# 배포된 공개 origin을 밖에서 점검한다 (읽기 전용 요청만, 로그인·AI 호출 없음).
#
#   ./check-public.sh https://plannet.example.com
#   ./check-public.sh https://plannet.test:19643 --insecure --resolve plannet.test:19643:127.0.0.1 \
#       --http-port 19680 --resolve plannet.test:19680:127.0.0.1   # 로컬 검증 클러스터에 대해 실행
#
# 확인: 인증서, HTTP→HTTPS, 경로 분리, 공개 설정(인증 on·백업 off), 미인증 거부, callback 주소,
#       세션 쿠키 속성, 보안 헤더, 그리고 Google이 callback 주소를 받아들이는지(redirect_uri_mismatch 여부).
# Google 확인은 로그인 화면 직전까지만 요청한다. 계정 로그인은 사람이 브라우저로 한다.
source "$(dirname "$0")/lib.sh"
require curl python3

origin="${1:-}"; shift || true
[[ "$origin" =~ ^https://[^/]+$ ]] || fail "사용법: $0 https://<공개 host[:port]> [--insecure] [--resolve h:p:ip] [--http-port N]"
curl_opts=(-sS --max-time 15)
http_port=80
while [[ $# -gt 0 ]]; do
  case "$1" in
    --insecure) curl_opts+=(-k); shift ;;
    --resolve) curl_opts+=(--resolve "$2"); shift 2 ;;
    --http-port) http_port="$2"; shift 2 ;;
    *) fail "알 수 없는 인자: $1" ;;
  esac
done
host_port="${origin#https://}"
host="${host_port%%:*}"
callback="$origin/login/oauth2/code/google"
report="$ARTIFACTS_DIR/public-check-$host.txt"
mkdir -p "$ARTIFACTS_DIR"
: > "$report"
failures=0

pass() { echo "  PASS  $*" | tee -a "$report"; }
bad() { echo "  FAIL  $*" | tee -a "$report"; failures=$((failures + 1)); }
expect() { if [[ "$2" == "$3" ]]; then pass "$1"; else bad "$1 (기대: $3, 실제: $2)"; fi; }
# 요청: 상태 코드와 헤더·본문을 임시 파일로 받는다
request() { curl "${curl_opts[@]}" -o "$tmp/body" -D "$tmp/headers" -w '%{http_code}' "$@" || echo "000"; }
header() { grep -i "^$1:" "$tmp/headers" | head -1 | cut -d' ' -f2- | tr -d '\r'; }
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT

echo "== $origin ($(date -u +%Y-%m-%dT%H:%M:%SZ))" | tee -a "$report"

# 1. 인증서·API 도달 (--insecure 가 없으면 curl이 인증서 체인을 검증한다)
expect "HTTPS + Spring health" "$(request "$origin/api/v1/health")" 200
grep -q '"UP"' "$tmp/body" && pass "health 본문 UP" || bad "health 본문: $(head -c 200 "$tmp/body")"

# 2. HTTP → HTTPS
http_origin="http://$host$([[ $http_port == 80 ]] || echo ":$http_port")"
status="$(request "$http_origin/api/v1/me?probe=1")"
[[ "$status" == 301 || "$status" == 308 ]] && pass "HTTP → HTTPS ($status)" || bad "HTTP 응답 $status (301/308 기대)"
expect "redirect 대상" "$(header location)" "$origin/api/v1/me?probe=1"

# 3. Web 경로·공개 설정
expect "Web /api/runtime-config" "$(request "$origin/api/runtime-config")" 200
expect "인증 on·백업 off" "$(python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); print(d.get("authEnabled"), d.get("backupEnabled"))' "$tmp/body" 2>/dev/null)" "True False"
expect "백업 GET 차단" "$(request "$origin/api/backup")" 403
expect "백업 POST 차단" "$(request -X POST -H 'content-type: application/json' -H "origin: $origin" --data '{}' "$origin/api/backup")" 403
expect "Web 응답 HSTS" "$(request "$origin/" >/dev/null; header strict-transport-security | grep -c max-age)" 1

# 4. 미인증 거부
expect "미인증 /api/v1/me" "$(request "$origin/api/v1/me")" 401
expect "미인증 /api/chat" "$(request -X POST -H 'content-type: application/json' -H "origin: $origin" \
  --data '{"messages":[{"role":"user","content":"x"}],"assistedCount":0}' "$origin/api/chat")" 401

# 5. 로그인 시작: callback 주소·세션 쿠키
expect "로그인 시작 redirect" "$(request "$origin/oauth2/authorization/google")" 302
location="$(header location || true)"
redirect_uri="$(python3 -c 'import sys,urllib.parse as u; q=u.parse_qs(u.urlparse(sys.argv[1]).query); print(q.get("redirect_uri",[""])[0])' "$location")"
expect "redirect_uri = 공개 callback" "$redirect_uri" "$callback"
cookie="$(grep -i '^set-cookie: PLANNET_SESSION=' "$tmp/headers" | tr -d '\r' || true)"
for attr in Secure HttpOnly "SameSite=Lax" "Path=/"; do
  [[ "$cookie" == *"$attr"* ]] && pass "세션 쿠키 $attr" || bad "세션 쿠키 $attr 없음"
done
[[ "$cookie" != *"Domain="* ]] && pass "세션 쿠키 host-only" || bad "세션 쿠키에 Domain 속성"

# 6. Google이 callback을 받아들이는지 (Console 등록 여부). 로그인 화면 직전까지만 확인한다.
if [[ "$location" == https://accounts.google.com/* ]]; then
  result="$(curl -sS --max-time 15 -o "$tmp/google" -w '%{http_code} %{redirect_url}' "$location" || echo 000)"
  status="${result%% *}"; next="${result#* }"
  # Google은 설정 오류를 302 → /signin/oauth/error?authError=<base64 protobuf> 로 알린다. 코드 문자열을 꺼낸다.
  google_error="$(python3 - "$next" "$tmp/google" <<'PY'
import base64, re, sys, urllib.parse as u
url, body = sys.argv[1], open(sys.argv[2], errors="ignore").read()
q = u.parse_qs(u.urlparse(url).query)
raw = q.get("authError", [""])[0]
text = ""
if raw:
    text = base64.urlsafe_b64decode(raw + "=" * (-len(raw) % 4)).decode("latin-1")
elif "/signin/oauth/error" in url or "redirect_uri_mismatch" in body:
    text = body
codes = re.findall(r"redirect_uri_mismatch|invalid_client|invalid_request|access_denied|disabled_client|org_internal|unauthorized_client", text)
print(" ".join(dict.fromkeys(codes)) or ("unknown_error" if "/signin/oauth/error" in url else ""))
PY
)"
  if [[ "$google_error" == *redirect_uri_mismatch* ]]; then
    bad "Google: redirect_uri_mismatch → Console '승인된 리디렉션 URI'에 $callback 등록 필요"
  elif [[ -n "$google_error" ]]; then
    bad "Google 오류: $google_error (client ID·OAuth 동의 화면 설정 확인)"
  elif [[ "$status" == 302 || "$status" == 200 ]]; then
    pass "Google이 client·callback을 받아들임 (HTTP $status → 로그인 화면)"
  else
    bad "Google 응답 $status"
  fi
else
  echo "  SKIP  Google 확인: 인증 서버가 Google이 아님 (${location%%\?*})" | tee -a "$report"
fi

echo "  결과: 실패 $failures 건 · 기록: $report" | tee -a "$report"
[[ $failures -eq 0 ]]
