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
