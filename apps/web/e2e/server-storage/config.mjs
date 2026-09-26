export const HOST = '127.0.0.1';
export const PORTS = { web: 3690, api: 3691, postgres: 3692, edge: 3693, oidc: 3694, control: 3695 };
export const ORIGIN = `http://${HOST}:${PORTS.edge}`;
export const ISSUER = `http://${HOST}:${PORTS.oidc}`;
export const DIST_DIR = '.next/server-storage-e2e';
export const READY_PATH = '/ready';
