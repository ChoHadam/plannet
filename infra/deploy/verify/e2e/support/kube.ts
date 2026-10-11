import { execFileSync } from 'node:child_process';
import { APP_NAMESPACE, KUBECONFIG } from './env';
import { raw } from './raw';

/** 검증 클러스터 전용 kubectl (전용 kubeconfig). 사용자의 기본 context를 쓰지 않는다. */
export function kubectl(args: string[], timeoutMs = 180_000): string {
  if (!KUBECONFIG) throw new Error('VERIFY_KUBECONFIG is required');
  return execFileSync('kubectl', ['--kubeconfig', KUBECONFIG, ...args], {
    encoding: 'utf8',
    timeout: timeoutMs,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

export function scaleApi(replicas: number) {
  kubectl(['-n', APP_NAMESPACE, 'scale', 'deployment/plannet-api', `--replicas=${replicas}`]);
  if (replicas === 0) {
    kubectl(['-n', APP_NAMESPACE, 'wait', 'pod', '-l', 'app.kubernetes.io/name=plannet-api', '--for=delete', '--timeout=120s']);
  } else {
    kubectl(['-n', APP_NAMESPACE, 'rollout', 'status', 'deployment/plannet-api', '--timeout=180s']);
  }
}

/** Web을 재시작한다 (Recreate). 호출 한도 카운터가 프로세스 메모리에 있어 초기화된다. */
export async function restartWeb() {
  kubectl(['-n', APP_NAMESPACE, 'rollout', 'restart', 'deployment/plannet-web']);
  kubectl(['-n', APP_NAMESPACE, 'rollout', 'status', 'deployment/plannet-web', '--timeout=180s']);
  // Gateway가 새 endpoint를 반영할 때까지 기다린다.
  for (let i = 0; i < 60; i++) {
    if ((await raw('/api/runtime-config').catch(() => null))?.status === 200) return;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error('web did not become reachable through the gateway');
}

/** 일회용 pod에서 HTTP 요청을 보내 결과 문자열(상태 코드 또는 ERR:...)을 돌려준다. */
export function probeFromPod(namespace: string, urls: string[]): Record<string, string> {
  const script = `
const urls = ${JSON.stringify(urls)};
const out = {};
for (const url of urls) {
  try { const r = await fetch(url, { signal: AbortSignal.timeout(4000) }); out[url] = String(r.status); }
  catch (e) { out[url] = 'ERR:' + (e.cause?.code ?? e.name); }
}
console.log('RESULT' + JSON.stringify(out));`;
  const output = kubectl([
    '-n', namespace, 'run', `netcheck-${Date.now()}`, '--rm', '-i', '--restart=Never', '--quiet',
    '--image=node:20-alpine', '--image-pull-policy=IfNotPresent', '--command', '--',
    'node', '--input-type=module', '-e', script,
  ]);
  const line = output.split('\n').find((l) => l.startsWith('RESULT'));
  if (!line) throw new Error(`probe failed: ${output}`);
  return JSON.parse(line.slice('RESULT'.length));
}

// ---- PostgreSQL 검증용 ----

export const DB_SERVICE = 'plannet-db';
export const DB_PORT = 5432;
export const DB_POD = 'plannet-db-0';
export const DB_PVC = 'data-plannet-db-0';
/** postgres.yaml NetworkPolicy가 허용하는 유지보수(백업·복구) pod label */
export const DB_MAINTENANCE_LABEL = 'plannet-db-maintenance';
const PROBE_IMAGE = 'node:20-alpine';
const TCP_TIMEOUT_MS = 4000;

function kubectlInput(args: string[], input: string, timeoutMs = 60_000): string {
  if (!KUBECONFIG) throw new Error('VERIFY_KUBECONFIG is required');
  return execFileSync('kubectl', ['--kubeconfig', KUBECONFIG, ...args], {
    encoding: 'utf8',
    timeout: timeoutMs,
    input,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

/** TCP 연결만 시도한다. 결과: 'open' 또는 'ERR:<code>'. 연결 성공이 SQL 권한을 뜻하지는 않는다. */
function tcpScript(host: string, port: number) {
  return `
const net = require('node:net');
const socket = net.connect({ host: ${JSON.stringify(host)}, port: ${port} });
const done = (r) => { console.log('RESULT' + r); socket.destroy(); process.exit(0); };
socket.setTimeout(${TCP_TIMEOUT_MS}, () => done('ERR:TIMEOUT'));
socket.on('connect', () => done('open'));
socket.on('error', (e) => done('ERR:' + (e.code ?? e.name)));`;
}

function parseResult(output: string) {
  const line = output.split('\n').find((l) => l.startsWith('RESULT'));
  if (!line) throw new Error(`probe produced no result: ${output}`);
  return line.slice('RESULT'.length);
}

/**
 * 주어진 namespace·label로 일회용 pod를 띄워 TCP 연결을 시도한다.
 * plannet namespace의 restricted Pod Security를 만족하는 securityContext를 쓴다.
 */
export function tcpProbeFromPod(namespace: string, labels: Record<string, string>, host: string, port: number): string {
  const name = `tcpcheck-${Date.now()}`;
  const pod = {
    apiVersion: 'v1',
    kind: 'Pod',
    metadata: { name, namespace, labels },
    spec: {
      restartPolicy: 'Never',
      automountServiceAccountToken: false,
      securityContext: { runAsNonRoot: true, runAsUser: 1000, runAsGroup: 1000, seccompProfile: { type: 'RuntimeDefault' } },
      containers: [{
        name: 'probe',
        image: PROBE_IMAGE,
        imagePullPolicy: 'IfNotPresent',
        command: ['node', '-e', tcpScript(host, port)],
        securityContext: { allowPrivilegeEscalation: false, readOnlyRootFilesystem: true, capabilities: { drop: ['ALL'] } },
      }],
    },
  };
  try {
    kubectlInput(['apply', '-f', '-'], JSON.stringify(pod));
    kubectl(['-n', namespace, 'wait', `pod/${name}`, '--for=jsonpath={.status.phase}=Succeeded', '--timeout=90s'], 100_000);
    return parseResult(kubectl(['-n', namespace, 'logs', name]));
  } finally {
    kubectl(['-n', namespace, 'delete', 'pod', name, '--ignore-not-found', '--wait=false']);
  }
}

/** 실행 중인 Web pod 안에서 TCP 연결을 시도한다 (Web label의 실제 네트워크 권한). */
export function tcpProbeFromWeb(host: string, port: number): string {
  return parseResult(kubectl(['-n', APP_NAMESPACE, 'exec', 'deploy/plannet-web', '--', 'node', '-e', tcpScript(host, port)], 30_000));
}

/**
 * DB pod 안에서 앱 전용 role(plannet_app)로 SQL을 실행한다. 비밀번호는 pod에 마운트된 파일에서 읽고 출력하지 않는다.
 * TCP 접근 검증과 별개로 실제 SQL 인증·권한을 확인하는 용도다.
 */
export function psqlAsApp(sql: string, database = 'plannet'): string {
  const script = 'PGPASSWORD="$(cat /run/plannet/app_password)" exec psql -h 127.0.0.1 -U plannet_app -d "$1" -XqAt -v ON_ERROR_STOP=1 -c "$2"';
  return kubectl(['-n', APP_NAMESPACE, 'exec', DB_POD, '-c', 'postgres', '--', 'sh', '-c', script, 'psql', database, sql], 30_000).trim();
}

export function resourceUid(kind: string, name: string): string {
  return kubectl(['-n', APP_NAMESPACE, 'get', kind, name, '-o', 'jsonpath={.metadata.uid}']).trim();
}

/** DB StatefulSet 정지/기동. PVC는 whenScaled: Retain 이라 유지된다. */
export function scaleDb(replicas: number) {
  kubectl(['-n', APP_NAMESPACE, 'scale', 'statefulset/plannet-db', `--replicas=${replicas}`]);
  if (replicas === 0) {
    kubectl(['-n', APP_NAMESPACE, 'wait', 'pod', '-l', 'app.kubernetes.io/name=plannet-db', '--for=delete', '--timeout=120s'], 130_000);
  } else {
    kubectl(['-n', APP_NAMESPACE, 'rollout', 'status', 'statefulset/plannet-db', '--timeout=180s'], 190_000);
  }
}

/** Gateway를 거쳐 API health가 200이 될 때까지 기다린다 (새 endpoint 반영). */
export async function waitApiReachable(timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if ((await raw('/api/v1/health').catch(() => null))?.status === 200) return;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error('api did not become reachable through the gateway');
}
