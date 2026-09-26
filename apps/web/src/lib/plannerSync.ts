/** Server storage protocol and durable draft state machine. No React/store dependencies. */
export const PLANNER_KINDS = ['mandalart', 'block6', 'monthly', 'daily', 'recurring', 'holidays'] as const;
export type PlannerKind = typeof PLANNER_KINDS[number];
export type PlannerData = Record<string, unknown>;
export interface PlannerDocument { kind: PlannerKind; id: string; data: PlannerData }
export interface PlannerRecord extends Omit<PlannerDocument, 'data'> {
  data: PlannerData | null;
  schemaVersion: 1;
  version: number;
  deleted: boolean;
  updatedAt: string;
}
export interface PlannerChange extends Omit<PlannerRecord, 'version' | 'deleted' | 'updatedAt'> { expectedVersion: number }
export interface PlannerCommit { requestId: string; changes: PlannerChange[] }
export interface SyncEnvelope {
  format: 1;
  userId: string;
  initialized: boolean;
  base: PlannerRecord[];
  drafts: PlannerChange[];
  inflight: PlannerCommit | null;
  blocked: 'conflict' | 'account' | null;
}
export interface SyncStatus {
  phase: 'loading' | 'saving' | 'saved' | 'error' | 'conflict';
  ready: boolean;
  pendingCount: number;
  message: string;
}
export const INITIAL_SYNC_STATUS: SyncStatus = { phase: 'loading', ready: false, pendingCount: 0, message: '서버 기록을 불러오는 중이에요.' };
export const SYNC_DEBOUNCE_MS = 650;
export const MAX_COMMIT_CHANGES = 100;
// Leave room for JSON envelope and escaping under the server's 8 MiB request limit.
const COMMIT_BYTE_BUDGET = 7 * 1024 * 1024;
export const syncStorageKey = (userId: string) => `plannet-server-sync@${userId}`;
export const recordKey = (record: Pick<PlannerDocument, 'kind' | 'id'>) => `${record.kind}:${record.id}`;

/** JSONB changes object key order. Equality must not manufacture edits on every reload. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).filter((key) => (value as PlannerData)[key] !== undefined).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson((value as PlannerData)[key])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}
const sameData = (a: unknown, b: unknown) => canonicalJson(a) === canonicalJson(b);

export class PlannerSyncError extends Error {
  constructor(public readonly code: string) { super(code); }
}

export function validateRecords(value: unknown): PlannerRecord[] {
  if (!Array.isArray(value)) throw new PlannerSyncError('invalid_response');
  const keys = new Set<string>();
  for (const item of value) {
    if (!item || !PLANNER_KINDS.includes(item.kind) || typeof item.id !== 'string' || !item.id || item.schemaVersion !== 1
      || !Number.isSafeInteger(item.version) || item.version < 1 || typeof item.deleted !== 'boolean'
      || typeof item.updatedAt !== 'string' || (item.deleted ? item.data !== null : !item.data || typeof item.data !== 'object' || Array.isArray(item.data))) {
      throw new PlannerSyncError('invalid_response');
    }
    const key = recordKey(item);
    if (keys.has(key)) throw new PlannerSyncError('invalid_response');
    keys.add(key);
  }
  return value as PlannerRecord[];
}

export interface SyncDependencies {
  storage: Pick<Storage, 'getItem' | 'setItem'>;
  read: () => Promise<PlannerRecord[]>;
  commit: (request: PlannerCommit) => Promise<PlannerRecord[]>;
  apply: (documents: PlannerDocument[]) => void;
  onStatus: (status: SyncStatus) => void;
  newRequestId: () => string;
}

/** A single instance belongs to one verified user for its complete lifetime. */
export class PlannerSync {
  private envelope: SyncEnvelope;
  private status = INITIAL_SYNC_STATUS;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private busy = false;
  private stopped = false;
  private loadFailed = false;
  private applying = false;

  constructor(readonly userId: string, private readonly deps: SyncDependencies) {
    this.envelope = { format: 1, userId, initialized: false, base: [], drafts: [], inflight: null, blocked: null };
    try {
      const raw = deps.storage.getItem(syncStorageKey(userId));
      if (raw) {
        const parsed = JSON.parse(raw) as SyncEnvelope;
        if (parsed.format !== 1 || parsed.userId !== userId || typeof parsed.initialized !== 'boolean'
          || !Array.isArray(parsed.drafts) || ![null, 'conflict', 'account'].includes(parsed.blocked)) throw new Error('invalid cache');
        validateRecords(parsed.base);
        for (const change of [...parsed.drafts, ...(parsed.inflight?.changes ?? [])]) {
          if (!PLANNER_KINDS.includes(change.kind) || typeof change.id !== 'string' || change.schemaVersion !== 1
            || !Number.isSafeInteger(change.expectedVersion) || change.expectedVersion < 0
            || (change.data !== null && (!change.data || typeof change.data !== 'object' || Array.isArray(change.data)))) throw new Error('invalid draft');
        }
        if (parsed.inflight && (typeof parsed.inflight.requestId !== 'string' || !Array.isArray(parsed.inflight.changes))) throw new Error('invalid commit');
        // Construction follows a fresh /me identity check. Same-account re-login can resume its own drafts.
        if (parsed.blocked === 'account') parsed.blocked = null;
        this.envelope = parsed;
      }
    } catch { this.loadFailed = true; }
  }

  getSnapshot(): SyncEnvelope { return JSON.parse(JSON.stringify(this.envelope)) as SyncEnvelope; }
  getStatus(): SyncStatus { return this.status; }
  backupText(): string {
    if (this.loadFailed) return this.deps.storage.getItem(syncStorageKey(this.userId)) ?? '{}';
    return JSON.stringify(this.envelope, null, 2);
  }

  private publish(phase: SyncStatus['phase'], message: string): void {
    if (this.stopped) return;
    this.status = { phase, message, ready: phase !== 'loading' && this.envelope.initialized && !this.loadFailed, pendingCount: this.envelope.drafts.length };
    this.deps.onStatus(this.status);
  }

  private persist(): void {
    try { this.deps.storage.setItem(syncStorageKey(this.userId), JSON.stringify(this.envelope)); }
    catch { throw new PlannerSyncError('local_storage'); }
  }

  documents(): PlannerDocument[] {
    const items = new Map<string, PlannerDocument>();
    for (const record of [...this.envelope.base, ...this.envelope.drafts]) {
      const key = recordKey(record);
      if (record.data === null) items.delete(key);
      else items.set(key, { kind: record.kind, id: record.id, data: record.data });
    }
    return [...items.values()];
  }

  private apply(): void {
    if (this.stopped) return;
    this.applying = true;
    try { this.deps.apply(this.documents()); }
    finally { this.applying = false; }
  }

  async start(): Promise<void> {
    if (this.busy || this.stopped) return;
    if (this.loadFailed) {
      this.publish('error', '브라우저 초안을 읽지 못했어요. 초안을 파일로 보관한 뒤 복구해주세요.');
      return;
    }
    this.busy = true;
    this.publish('loading', '서버 기록을 불러오는 중이에요.');
    try {
      if (this.envelope.initialized) this.apply();
      if (this.envelope.blocked === 'account') throw new PlannerSyncError('account_changed');
      // Replay the exact persisted request before GET so a lost ACK is never a false version conflict.
      if (this.envelope.inflight && !this.envelope.blocked) await this.sendInflight();
      if (this.envelope.blocked === 'conflict') throw new PlannerSyncError('version_conflict');
      const records = await this.deps.read();
      if (this.stopped) return;
      this.envelope.base = records;
      this.envelope.initialized = true;
      this.persist();
      this.apply();
      this.publishPending();
    } catch (error) { this.fail(error); }
    finally { this.busy = false; }
    if (this.status.phase !== 'error' && this.status.phase !== 'conflict') this.schedule();
  }

  /** Called synchronously after each store edit, before a network debounce. */
  capture(documents: PlannerDocument[]): void {
    if (this.stopped || this.applying || !this.envelope.initialized || this.loadFailed) return;
    const base = new Map(this.envelope.base.map((record) => [recordKey(record), record]));
    const desired = new Map(documents.map((document) => [recordKey(document), document]));
    const previous = new Map(this.envelope.drafts.map((change) => [recordKey(change), change]));
    const inflightKeys = new Set(this.envelope.inflight?.changes.map(recordKey));
    const drafts: PlannerChange[] = [];
    for (const key of new Set([...base.keys(), ...desired.keys(), ...previous.keys(), ...inflightKeys])) {
      const remote = base.get(key);
      const document = desired.get(key);
      const prior = previous.get(key);
      const identity = document ?? remote ?? prior ?? this.envelope.inflight?.changes.find((change) => recordKey(change) === key);
      if (!identity) continue;
      const data = document?.data ?? null;
      // Empty optional settings are the default, so selection/view changes cannot create server writes.
      if (!remote && !prior && !inflightKeys.has(key) && document && (
        (document.kind === 'recurring' && Array.isArray(data?.todos) && data.todos.length === 0)
        || (document.kind === 'holidays' && data?.manualHolidays && Object.keys(data.manualHolidays).length === 0)
      )) continue;
      if (!sameData(data, remote?.data ?? null) || inflightKeys.has(key)) {
        drafts.push({ kind: identity.kind, id: identity.id, schemaVersion: 1, expectedVersion: prior?.expectedVersion ?? remote?.version ?? 0, data });
      }
    }
    if (sameData(drafts, this.envelope.drafts)) return;
    this.envelope.drafts = drafts;
    try {
      this.persist();
      if (!this.envelope.blocked) this.publishPending();
      this.schedule();
    } catch (error) { this.fail(error); }
  }

  private publishPending(): void {
    if (this.envelope.drafts.length || this.envelope.inflight) this.publish('saving', `서버에 저장 중이에요. 남은 기록 ${this.envelope.drafts.length}개`);
    else this.publish('saved', '서버에 저장됐어요.');
  }

  private schedule(): void {
    if (this.timer) clearTimeout(this.timer);
    if (this.stopped || this.envelope.blocked || (!this.envelope.drafts.length && !this.envelope.inflight)) return;
    this.timer = setTimeout(() => { void this.flush(); }, SYNC_DEBOUNCE_MS);
  }

  private async sendInflight(): Promise<void> {
    const request = this.envelope.inflight;
    if (!request) return;
    // A crash after POST must always leave this exact request durably available.
    this.persist();
    const records = await this.deps.commit(request);
    if (this.stopped) return;
    if (records.length !== request.changes.length || request.changes.some((change) => !records.some((record) => recordKey(record) === recordKey(change)))) {
      throw new PlannerSyncError('invalid_response');
    }
    const base = new Map(this.envelope.base.map((record) => [recordKey(record), record]));
    for (const record of records) {
      const key = recordKey(record);
      const submitted = request.changes.find((change) => recordKey(change) === key)!;
      base.set(key, record);
      this.envelope.drafts = this.envelope.drafts.flatMap((draft) => {
        if (recordKey(draft) !== key) return [draft];
        // A later local edit survives the ACK and uses the newly acknowledged version.
        return sameData(draft.data, submitted.data) ? [] : [{ ...draft, expectedVersion: record.version }];
      });
    }
    this.envelope.base = [...base.values()];
    this.envelope.inflight = null;
    this.persist();
  }

  async flush(): Promise<void> {
    if (this.busy || this.stopped || this.loadFailed || this.envelope.blocked || !this.envelope.initialized) return;
    this.busy = true;
    try {
      this.publishPending();
      while (!this.stopped && (this.envelope.inflight || this.envelope.drafts.length)) {
        if (!this.envelope.inflight) {
          const changes: PlannerChange[] = [];
          let bytes = 0;
          for (const change of this.envelope.drafts) {
            const length = new TextEncoder().encode(JSON.stringify(change)).length;
            if (changes.length && (changes.length === MAX_COMMIT_CHANGES || bytes + length > COMMIT_BYTE_BUDGET)) break;
            changes.push(change);
            bytes += length;
          }
          this.envelope.inflight = { requestId: this.deps.newRequestId(), changes };
        }
        await this.sendInflight();
      }
      this.publishPending();
    } catch (error) { this.fail(error); }
    finally { this.busy = false; }
  }

  private fail(error: unknown): void {
    if (this.stopped) return;
    const code = error instanceof PlannerSyncError ? error.code : 'network';
    if (code === 'version_conflict' || code === 'idempotency_conflict') this.envelope.blocked = 'conflict';
    if (code === 'account_changed' || code === 'unauthorized') this.envelope.blocked = 'account';
    try { if (!this.loadFailed) this.persist(); } catch { /* The visible error still keeps the in-memory draft downloadable. */ }
    const messages: Record<string, string> = {
      version_conflict: '다른 기기에서 바뀐 기록이 있어요. 내 초안은 보관했어요.',
      idempotency_conflict: '저장 요청을 확인하지 못했어요. 내 초안은 보관했어요.',
      account_changed: '로그인 계정이 바뀌었어요. 초안을 보관한 뒤 새로고침해주세요.',
      unauthorized: '로그인이 만료됐어요. 초안을 보관한 뒤 다시 로그인해주세요.',
      local_storage: '브라우저에 초안을 보관하지 못했어요. 새로고침 전에 초안을 파일로 저장해주세요.',
      invalid_request: '서버가 기록 형식을 확인하지 못했어요. 초안을 파일로 보관해주세요.',
      payload_too_large: '기록이 너무 커서 저장하지 못했어요. 초안을 파일로 보관해주세요.',
      invalid_response: '서버 기록을 확인하지 못했어요. 초안을 유지하고 다시 시도해주세요.',
    };
    this.publish(this.envelope.blocked === 'conflict' ? 'conflict' : 'error', messages[code] ?? '서버에 저장하지 못했어요. 초안을 유지하고 다시 시도해주세요.');
  }

  async retry(): Promise<void> {
    if (this.envelope.blocked) {
      this.fail(new PlannerSyncError(this.envelope.blocked === 'account' ? 'account_changed' : 'version_conflict'));
      return;
    }
    if (this.envelope.initialized && (this.envelope.drafts.length || this.envelope.inflight)) await this.flush();
    else await this.start();
  }

  /** User explicitly chose server content. Archive is durable before discarding any draft. */
  async useServer(): Promise<void> {
    if (this.busy || this.stopped || this.envelope.blocked === 'account') return;
    this.busy = true;
    try {
      const archive = this.backupText();
      try { this.deps.storage.setItem(`${syncStorageKey(this.userId)}:backup:${this.deps.newRequestId()}`, archive); }
      catch { throw new PlannerSyncError('local_storage'); }
      if (this.envelope.inflight && !this.envelope.blocked) await this.sendInflight();
      const records = await this.deps.read();
      if (this.stopped) return;
      this.envelope = { ...this.envelope, base: records, drafts: [], inflight: null, blocked: null, initialized: true };
      this.loadFailed = false;
      this.persist();
      this.apply();
      this.publishPending();
    } catch (error) { this.fail(error); }
    finally { this.busy = false; }
  }

  importDocuments(documents: PlannerDocument[]): { added: number; skipped: number; collisions: string[] } {
    if (!this.status.ready || this.envelope.blocked) throw new PlannerSyncError('not_ready');
    const existing = new Map(this.documents().map((document) => [recordKey(document), document]));
    const tombstones = new Set([...this.envelope.base.filter((record) => record.deleted), ...this.envelope.drafts.filter((draft) => draft.data === null)].map(recordKey));
    const additions: PlannerDocument[] = [];
    const collisions: string[] = [];
    let skipped = 0;
    for (const document of documents) {
      const key = recordKey(document);
      const current = existing.get(key);
      if (tombstones.has(key) || (current && !sameData(current.data, document.data))) collisions.push(key);
      else if (current) skipped++;
      else { additions.push(document); existing.set(key, document); }
    }
    if (collisions.length) return { added: 0, skipped, collisions };
    this.capture([...existing.values()]);
    this.apply();
    return { added: additions.length, skipped, collisions };
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
  }
}
