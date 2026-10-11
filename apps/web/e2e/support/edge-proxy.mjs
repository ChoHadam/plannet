/**
 * Ingress 역할을 하는 최소 reverse proxy.
 * 문서의 라우팅 정책과 같게 Spring 경로만 API로 보내고 나머지는 Web으로 보낸다.
 * (`/api/**` 전체를 넘기지 않는다: /api/chat, /api/backup, /api/runtime-config는 Web 소유)
 * Host 헤더는 그대로 전달한다. 실제 Ingress도 기본적으로 Host를 보존한다.
 */
import http from 'node:http';
import { HOST } from './stack.config.mjs';

const API_PREFIXES = ['/api/v1/', '/oauth2/', '/login/oauth2/'];

function isApiPath(pathname) {
  return pathname === '/api/v1' || API_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export function startEdgeProxy({ port, webPort, apiPort, readyPath }) {
  const server = http.createServer((req, res) => {
    const pathname = new URL(req.url, 'http://edge').pathname;
    if (readyPath && pathname === readyPath) {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('ready');
      return;
    }
    const targetPort = isApiPath(pathname) ? apiPort : webPort;

    const upstream = http.request(
      { host: HOST, port: targetPort, method: req.method, path: req.url, headers: req.headers },
      (upstreamRes) => {
        res.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.headers);
        upstreamRes.pipe(res);
      },
    );
    upstream.on('error', () => {
      if (!res.headersSent) res.writeHead(502, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'bad gateway' }));
    });
    req.pipe(upstream);
  });
  return new Promise((resolve) => server.listen(port, HOST, () => resolve(server)));
}
