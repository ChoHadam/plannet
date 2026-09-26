import http from 'node:http';
import https from 'node:https';
import { HOST, HTTP_PORT, HTTPS_PORT, MOCK_HOST } from './env';

/**
 * 브라우저를 거치지 않는 원시 HTTP 요청. redirect를 따라가지 않고 Set-Cookie·Location을 그대로 본다.
 * 검증 도메인을 127.0.0.1로 해석하고, TLS SNI는 요청한 host로 보낸다.
 */
export interface RawResponse {
  status: number;
  headers: http.IncomingHttpHeaders;
  body: string;
  json<T = Record<string, unknown>>(): T;
}

export interface RawOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  scheme?: 'https' | 'http';
  host?: string;
  /** TLS SNI와 다른 Host 헤더를 보낼 때 */
  hostHeader?: string;
}

const LOCAL_HOSTS = new Set([HOST, MOCK_HOST]);

export function raw(path: string, options: RawOptions = {}): Promise<RawResponse> {
  const scheme = options.scheme ?? 'https';
  const host = options.host ?? HOST;
  const port = scheme === 'https' ? HTTPS_PORT : HTTP_PORT;
  const client = scheme === 'https' ? https : http;
  return new Promise((resolve, reject) => {
    const req = client.request(
      {
        host,
        port,
        path,
        method: options.method ?? 'GET',
        headers: { host: options.hostHeader ?? `${host}:${port}`, ...options.headers },
        servername: host,
        rejectUnauthorized: false, // 검증용 자체 서명 인증서
        lookup: (hostname, opts, callback) => {
          if (!LOCAL_HOSTS.has(hostname)) return callback(new Error(`unexpected host ${hostname}`), '', 4);
          if ((opts as { all?: boolean }).all) {
            return (callback as unknown as (e: null, a: { address: string; family: number }[]) => void)(null, [
              { address: '127.0.0.1', family: 4 },
            ]);
          }
          return callback(null, '127.0.0.1', 4);
        },
        timeout: 15_000,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf8');
          resolve({ status: res.statusCode ?? 0, headers: res.headers, body, json: () => JSON.parse(body) });
        });
      },
    );
    req.on('timeout', () => req.destroy(new Error(`timeout ${path}`)));
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

export function setCookies(response: RawResponse): string[] {
  const value = response.headers['set-cookie'];
  return Array.isArray(value) ? value : value ? [value] : [];
}

/** 대역 서버 통계 (Google authorize 요청 수, AI 호출 수 등) */
export interface MockStats {
  authorizeRequests: number;
  redirectMismatches: number;
  tokensIssued: number;
  tokenRejected: number;
  aiCalls: number;
  lastAuthorize: { client_id: string; redirect_uri: string; scope: string } | null;
}

export async function mockStats(): Promise<MockStats> {
  return (await raw('/__stats', { host: MOCK_HOST })).json<MockStats>();
}
