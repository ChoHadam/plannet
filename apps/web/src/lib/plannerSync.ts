/**
 * Server storage protocol and draft state machine. No React/store dependencies.
 * PostgreSQL is the only durable copy of authenticated planner content. Unsaved edits live in this tab's memory and,
 * when available, in a per-tab pending journal (changed records + the exact inflight request only) so a reload during
 * the save debounce does not lose them. The journal is removed once every change is acknowledged.
 */
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
/** In-memory state of one tab. Exported only as an explicit user download. */
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
  /** Initial DB read done and not blocked by an unrecoverable local state: imports may run. */
  ready: boolean;
  /** First DB read succeeded. The planner must not be editable before this. */
  loaded: boolean;
  /** Unsent or unacknowledged edits exist only in this tab (drafts or an inflight request). */
  dirty: boolean;
  pendingCount: number;
  /** Increments whenever captured drafts change. Used to refuse a stale discard confirmation. */
  revision: number;
  /** Reload protection of pending changes: off (no journal), active, unavailable (writes fail), invalid (unreadable journal kept) */
  protection: JournalProtection;
  message: string;
  /** Re-check of the server copy after the first load (tab focus, online). Independent of the save phase. */
  refresh: RefreshStatus;
}
export type JournalProtection = 'off' | 'active' | 'unavailable' | 'invalid';
/** UI reasons not to replace displayed content: focused/recent input or dialog, unsent local text of a removed plan, open AI chat. */
export type RefreshHold = 'editing' | 'draft' | 'assistant';
export interface RefreshImpact { selectionRemoved: boolean }
export interface RefreshStatus {
  state: 'idle' | 'checking' | 'deferred' | 'failed' | 'updated';
  /** deferred: hold or unsaved/blocked local state. failed: network or invalid server copy. */
  reason: RefreshHold | 'unsaved' | 'blocked' | 'network' | 'invalid' | null;
  /** A server copy different from this tab was read but not applied. */
  changed: boolean;
  /** updated: the selected plan no longer exists on the server. */
  selectionRemoved: boolean;
}
export const IDLE_REFRESH: RefreshStatus = { state: 'idle', reason: null, changed: false, selectionRemoved: false };
export const INITIAL_SYNC_STATUS: SyncStatus = {
  phase: 'loading', ready: false, loaded: false, dirty: false, pendingCount: 0, revision: 0, protection: 'off', message: '서버 기록을 불러오는 중이에요.',
  refresh: IDLE_REFRESH,
};

/** Only unacknowledged work: changed records with their original expected versions and the exact inflight request. */
export interface PendingState { drafts: PlannerChange[]; inflight: PlannerCommit | null }
export type JournalRead =
  | { status: 'empty' }
  | { status: 'ok'; state: PendingState; raw: string }
  | { status: 'invalid'; raw: string }
  | { status: 'unavailable' };
/** Temporary per-account pending-change store. Every method must be safe to fail (returns false/unavailable). */
export interface PendingJournal {
  read(): JournalRead;
  write(state: PendingState): boolean;
  clear(): boolean;
}
export const SYNC_DEBOUNCE_MS = 650;
export const MAX_COMMIT_CHANGES = 100;
// Leave room for JSON envelope and escaping under the server's 8 MiB request limit.
const COMMIT_BYTE_BUDGET = 7 * 1024 * 1024;
/** Key used by the previous durable-cache design. Read-only now: only for manual recovery of old drafts. */
export const legacySyncStorageKey = (userId: string) => `plannet-server-sync@${userId}`;
export const recordKey = (record: Pick<PlannerDocument, 'kind' | 'id'>) => `${record.kind}:${record.id}`;

/** JSONB changes object key order. Equality must not manufacture edits on every reload. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).filter((key) => (value as PlannerData)[key] !== undefined).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson((value as PlannerData)[key])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}
// Same reference serializes identically at this instant. apply() hands DB data to the stores, so unchanged plans skip
// serialization on each edit; edited (new) objects are still compared canonically.
const sameData = (a: unknown, b: unknown) => a === b || canonicalJson(a) === canonicalJson(b);

/** Visible documents of server records plus local changes (null data removes). */
function mergeDocuments(records: Pick<PlannerRecord, 'kind' | 'id' | 'data'>[]): PlannerDocument[] {
  const items = new Map<string, PlannerDocument>();
  for (const record of records) {
    const key = recordKey(record);
    if (record.data === null) items.delete(key);
    else items.set(key, { kind: record.kind, id: record.id, data: record.data });
  }
  return [...items.values()];
}
const sameDocuments = (a: PlannerDocument[], b: PlannerDocument[]) =>
  sameData(Object.fromEntries(a.map((item) => [recordKey(item), item.data])), Object.fromEntries(b.map((item) => [recordKey(item), item.data])));

const REQUEST_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Structural check of a stored change. Document content is validated separately by apply(). */
export function isPlannerChange(value: unknown): value is PlannerChange {
  const change = value as PlannerChange | null;
  return !!change && typeof change === 'object' && PLANNER_KINDS.includes(change.kind) && typeof change.id === 'string' && !!change.id
    && change.schemaVersion === 1 && Number.isSafeInteger(change.expectedVersion) && change.expectedVersion >= 0
    && (change.data === null || (!!change.data && typeof change.data === 'object' && !Array.isArray(change.data)));
}

/** Parses a stored pending state for `userId`. Anything unexpected is null (never partially trusted). */
export function parsePendingState(value: unknown, userId: string): PendingState | null {
  const stored = value as { format?: unknown; userId?: unknown; drafts?: unknown; inflight?: unknown } | null;
  if (!stored || typeof stored !== 'object' || stored.format !== 1 || stored.userId !== userId || !Array.isArray(stored.drafts)) return null;
  if (!stored.drafts.every(isPlannerChange) || new Set(stored.drafts.map(recordKey)).size !== stored.drafts.length) return null;
  const inflight = stored.inflight as PlannerCommit | null | undefined;
  if (inflight !== null && inflight !== undefined) {
    if (typeof inflight !== 'object' || typeof inflight.requestId !== 'string' || !REQUEST_ID_PATTERN.test(inflight.requestId)
      || !Array.isArray(inflight.changes) || !inflight.changes.length || !inflight.changes.every(isPlannerChange)
      || new Set(inflight.changes.map(recordKey)).size !== inflight.changes.length) return null;
  }
  return { drafts: stored.drafts, inflight: inflight ?? null };
}

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
  read: () => Promise<PlannerRecord[]>;
  commit: (request: PlannerCommit) => Promise<PlannerRecord[]>;
  apply: (documents: PlannerDocument[]) => void;
  /** Validate recovered request payloads too, including older inflight values hidden by a newer draft. */
  validateDocuments?: (documents: PlannerDocument[]) => void;
  onStatus: (status: SyncStatus) => void;
  newRequestId: () => string;
  /** Optional reload protection. Absent in tests of the pure memory behaviour. */
  journal?: PendingJournal;
  /** UI hold on replacing displayed content. `impact` is passed once a changed server copy is known. */
  refreshHold?: (impact?: RefreshImpact) => RefreshHold | null;
  /** Counter of user input in the UI. A change during a refresh read means the user acted on the old content. */
  inputActivity?: () => number;
  refreshImpact?: (documents: PlannerDocument[]) => RefreshImpact;
  /** Applies a refreshed server copy touching only changed stores. Defaults to apply. */
  applyRefresh?: (documents: PlannerDocument[]) => void;
}

const SYNC_MESSAGES: Record<string, string> = {
  version_conflict: '다른 기기에서 바뀐 기록이 있어 저장하지 않았어요. 내 수정은 이 탭에만 남아 있어요.',
  idempotency_conflict: '저장 요청을 확인하지 못했어요. 내 수정은 이 탭에만 남아 있어요.',
  account_changed: '로그인 계정이 바뀌었어요. 이 탭의 수정은 보내지 않았어요. 파일로 저장한 뒤 새로고침해주세요.',
  unauthorized: '로그인이 만료됐어요. 이 탭의 수정은 보내지 않았어요. 파일로 저장한 뒤 다시 로그인해주세요.',
  invalid_request: '서버가 기록 형식을 확인하지 못했어요. 수정을 파일로 저장해주세요.',
  payload_too_large: '기록이 너무 커서 저장하지 못했어요. 수정을 파일로 저장해주세요.',
  invalid_response: '서버 응답을 확인하지 못했어요. 수정은 이 탭에 남아 있어요. 다시 시도해주세요.',
  storage_unavailable: '서버 저장소에 연결하지 못했어요. 수정은 이 탭에 남아 있어요. 다시 시도해주세요.',
};
const DEFAULT_FAILURE = '서버에 저장하지 못했어요. 수정은 이 탭에 남아 있어요. 다시 시도하거나 파일로 저장해주세요.';
const LOAD_FAILURE = '서버 기록을 불러오지 못했어요. 다시 시도해주세요.';
/** settle() retries at most this many flush rounds (new edits during a flush trigger another round). */
const SETTLE_ROUNDS = 3;
/** A refresh read overtaken by user activity is re-read at most once, then waits for the next trigger. */
const REFRESH_READS = 2;

/** A single instance belongs to one verified user for its complete lifetime. */
export class PlannerSync {
  private envelope: SyncEnvelope;
  private status = INITIAL_SYNC_STATUS;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running: Promise<void> | null = null;
  private stopped = false;
  private applying = false;
  private revision = 0;
  private protection: JournalProtection = 'off';
  /** Parsed journal waiting for the first successful DB read. Never displayed or sent before that. */
  private restorable: PendingState | null = null;
  /** Unreadable journal text kept verbatim for explicit download/discard. */
  private invalidJournal: string | null = null;
  /** Raw text of the journal being restored (kept verbatim if document validation rejects it). */
  private restoredRaw: string | null = null;
  private refreshStatus = IDLE_REFRESH;
  private refreshing: Promise<void> | null = null;
  /** A requested refresh has not been applied yet. Re-run after a save ACK or a released UI hold. */
  private refreshPending = false;
  private lastRead = 0;

  constructor(readonly userId: string, private readonly deps: SyncDependencies) {
    this.envelope = { format: 1, userId, initialized: false, base: [], drafts: [], inflight: null, blocked: null };
    if (deps.journal) this.readJournal(deps.journal);
  }

  private readJournal(journal: PendingJournal): void {
    const stored = journal.read();
    this.protection = stored.status === 'invalid' ? 'invalid' : stored.status === 'unavailable' ? 'unavailable' : 'active';
    if (stored.status === 'invalid') this.invalidJournal = stored.raw;
    if (stored.status === 'ok' && (stored.state.drafts.length || stored.state.inflight)) {
      this.restorable = stored.state;
      this.restoredRaw = stored.raw;
    }
  }

  /** Writes only pending changes; removes this account's key when clean. Failures never block DB saves. */
  private persist(): void {
    const journal = this.deps.journal;
    if (!journal || this.protection === 'invalid' || this.stopped || !this.envelope.initialized) return;
    const ok = this.isDirty()
      ? journal.write({ drafts: this.envelope.drafts, inflight: this.envelope.inflight })
      : journal.clear();
    this.protection = ok ? 'active' : 'unavailable';
  }

  /** Unreadable stored journal, verbatim (for an explicit user download). */
  invalidJournalText(): string | null { return this.invalidJournal; }

  /** User explicitly discarded an unreadable journal. Only this account's key is removed. */
  discardInvalidJournal(): boolean {
    const journal = this.deps.journal;
    if (!journal || this.protection !== 'invalid') return false;
    if (!journal.clear()) { this.publish(this.status.phase, this.status.message); return false; }
    this.invalidJournal = null;
    this.protection = 'active';
    this.persist();
    this.publish(this.status.phase, this.status.message);
    return true;
  }

  getSnapshot(): SyncEnvelope { return JSON.parse(JSON.stringify(this.envelope)) as SyncEnvelope; }
  getStatus(): SyncStatus { return this.status; }
  /** Unsent/unacknowledged edits, including a stored journal that could not be restored yet (first DB read pending/failed). */
  isDirty(): boolean { return this.envelope.drafts.length > 0 || this.envelope.inflight !== null || this.restorable !== null; }
  /** Explicit user export of this tab's unsaved state. */
  backupText(): string {
    const { userId, blocked } = this.envelope;
    const { drafts, inflight } = this.restorable ?? this.envelope;
    return JSON.stringify({ format: 1, kind: 'plannet-unsaved-draft', userId, exportedAt: new Date().toISOString(), blocked, drafts, inflight }, null, 2);
  }

  private publish(phase: SyncStatus['phase'], message: string): void {
    if (this.stopped) return;
    const loaded = this.envelope.initialized;
    this.status = {
      phase, message, loaded, ready: phase !== 'loading' && loaded,
      dirty: this.isDirty(), pendingCount: (this.restorable ?? this.envelope).drafts.length, revision: this.revision, protection: this.protection,
      refresh: this.refreshStatus,
    };
    this.deps.onStatus(this.status);
  }

  documents(): PlannerDocument[] {
    return mergeDocuments([...this.envelope.base, ...this.envelope.drafts]);
  }

  private apply(): void {
    if (this.stopped) return;
    this.applying = true;
    try { this.deps.apply(this.documents()); }
    finally { this.applying = false; }
  }

  /** Runs one exclusive operation. Callers that need the result await `running`. */
  private exclusive(operation: () => Promise<void>): Promise<void> {
    if (this.running || this.stopped) return this.running ?? Promise.resolve();
    const run = operation().finally(() => { if (this.running === run) this.running = null; });
    this.running = run;
    return run;
  }

  /** Always reads fresh DB records. There is no browser cache to restore. */
  start(): Promise<void> {
    return this.exclusive(async () => {
      this.publish('loading', '서버 기록을 불러오는 중이에요.');
      try {
        if (this.envelope.blocked === 'account') throw new PlannerSyncError('account_changed');
        this.lastRead = Date.now();
        const records = await this.deps.read();
        if (this.stopped) return;
        this.envelope.base = records;
        this.restore(records);
        // Keep editing gated until the document-level validation in apply succeeds.
        this.envelope.initialized = true;
        this.persist();
        this.publishPending();
      } catch (error) {
        this.fail(error, this.envelope.initialized ? undefined : LOAD_FAILURE);
      }
    }).then(() => { if (this.status.phase !== 'error' && this.status.phase !== 'conflict') this.schedule(); });
  }

  /**
   * Applies DB records, then (same verified account, after a successful read) any stored pending changes with their
   * original expected versions. A journal rejected by document validation is kept verbatim and not applied.
   */
  private restore(records: PlannerRecord[]): void {
    const pending = this.restorable;
    if (!pending) { this.apply(); return; }
    const base = new Map(records.map((record) => [recordKey(record), record]));
    const inflightKeys = new Set(pending.inflight?.changes.map(recordKey));
    // Changes the DB already holds need no write (avoids a false conflict after an accepted POST).
    const drafts = pending.drafts.filter((draft) => inflightKeys.has(recordKey(draft)) || !sameData(draft.data, base.get(recordKey(draft))?.data ?? null));
    this.envelope.drafts = drafts;
    this.envelope.inflight = pending.inflight;
    try {
      this.deps.validateDocuments?.([...pending.drafts, ...(pending.inflight?.changes ?? [])]
        .filter((change) => change.data !== null)
        .map((change) => ({ kind: change.kind, id: change.id, data: change.data! })));
      this.apply();
    } catch {
      this.envelope.drafts = [];
      this.envelope.inflight = null;
      this.apply(); // A DB-level problem still fails the load and keeps the journal for the next attempt.
      this.invalidJournal = this.restoredRaw;
      this.protection = 'invalid';
    }
    this.restorable = null;
    this.restoredRaw = null;
    this.revision++;
  }

  /** Called synchronously after each store edit, before a network debounce. */
  capture(documents: PlannerDocument[]): void {
    if (this.stopped || this.applying || !this.envelope.initialized) return;
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
    this.revision++;
    if (this.refreshStatus.state === 'updated') this.refreshStatus = IDLE_REFRESH;
    // Journal before the debounce: a reload inside the gap keeps the change.
    this.persist();
    if (this.envelope.blocked) this.publish(this.status.phase, this.status.message);
    else this.publishPending();
    this.schedule();
  }

  private publishPending(): void {
    if (this.isDirty()) this.publish('saving', `서버에 저장 중이에요. 남은 기록 ${this.envelope.drafts.length}개`);
    else this.publish('saved', '서버에 저장됐어요.');
  }

  private schedule(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (this.stopped || this.envelope.blocked || !this.isDirty()) return;
    this.timer = setTimeout(() => { this.timer = null; void this.flush(); }, SYNC_DEBOUNCE_MS);
  }

  private async sendInflight(): Promise<void> {
    const request = this.envelope.inflight;
    if (!request) return;
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
  }

  /** Sends drafts. A failed request stays inflight and is re-sent with the same requestId. */
  flush(): Promise<void> {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    if (this.envelope.blocked || !this.envelope.initialized) return this.running ?? Promise.resolve();
    return this.exclusive(async () => {
      try {
        this.publishPending();
        while (!this.stopped && this.isDirty()) {
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
          // The exact request is recorded before the POST so a reload re-sends the same requestId.
          this.persist();
          await this.sendInflight();
          this.persist();
        }
        this.publishPending();
      } catch (error) { this.fail(error); }
    }).then(() => { if (this.refreshPending) void this.refresh(); });
  }

  private fail(error: unknown, override?: string): void {
    if (this.stopped) return;
    const code = error instanceof PlannerSyncError ? error.code : 'network';
    if (code === 'version_conflict' || code === 'idempotency_conflict') this.envelope.blocked = 'conflict';
    if (code === 'account_changed' || code === 'unauthorized') this.envelope.blocked = 'account';
    const message = code === 'account_changed' || code === 'unauthorized' ? SYNC_MESSAGES[code] : override ?? SYNC_MESSAGES[code] ?? DEFAULT_FAILURE;
    this.publish(this.envelope.blocked === 'conflict' ? 'conflict' : 'error', message);
  }

  async retry(): Promise<void> {
    if (this.envelope.blocked) {
      this.fail(new PlannerSyncError(this.envelope.blocked === 'account' ? 'account_changed' : 'version_conflict'));
      return;
    }
    if (this.envelope.initialized) await this.flush();
    else await this.start();
  }

  /**
   * Waits for any running save and flushes remaining drafts. True only when every edit is acknowledged.
   * Logout must not proceed on false: the edits would exist nowhere else.
   */
  async settle(): Promise<boolean> {
    for (let round = 0; round < SETTLE_ROUNDS && !this.stopped; round++) {
      if (this.running) await this.running;
      if (!this.envelope.initialized || this.envelope.blocked) break;
      if (!this.isDirty()) return this.status.phase !== 'error';
      await this.flush();
    }
    return this.envelope.initialized && !this.envelope.blocked && !this.isDirty() && this.status.phase !== 'error';
  }

  /**
   * User explicitly chose server content after confirming the discard of `confirmedRevision`.
   * Refuses (keeping every draft) if drafts changed after the confirmation or while reading.
   */
  async useServer(confirmedRevision: number): Promise<boolean> {
    if (this.stopped || this.envelope.blocked === 'account') return false;
    // Loop: a refresh may start right after another operation; exclusive() would otherwise skip this one.
    while (this.running) await this.running;
    if (confirmedRevision !== this.revision) {
      this.publish(this.status.phase, '확인한 뒤에 새 수정이 생겨 서버 내용을 불러오지 않았어요. 다시 확인해주세요.');
      return false;
    }
    let replaced = false;
    await this.exclusive(async () => {
      try {
        const records = await this.deps.read();
        if (this.stopped) return;
        if (confirmedRevision !== this.revision) {
          this.publish(this.status.phase, '불러오는 동안 새 수정이 생겨 서버 내용으로 바꾸지 않았어요. 다시 확인해주세요.');
          return;
        }
        const previous = this.envelope;
        this.envelope = { ...previous, base: records, drafts: [], inflight: null, blocked: null, initialized: true };
        try { this.apply(); }
        catch (error) {
          // A malformed server document must not discard the user's in-memory edits.
          this.envelope = previous;
          throw error;
        }
        this.revision++;
        this.refreshPending = false;
        this.refreshStatus = IDLE_REFRESH;
        this.persist();
        this.publishPending();
        replaced = true;
      } catch (error) { this.fail(error); }
    });
    return replaced;
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

  /** Time of the last server read start (initial load or refresh), for the UI trigger cooldown. */
  lastReadAt(): number { return this.lastRead; }

  /** UI hold released: run a refresh that was deferred. */
  resumeRefresh(): Promise<void> {
    return this.refreshPending ? this.refresh() : Promise.resolve();
  }

  /**
   * Conditional re-read of the server copy (tab focus, online, manual check). Concurrent calls share one run.
   * Replaces base and stores only if, before and after the read, nothing is unsaved/inflight/blocked, no edit happened
   * during the read and the UI holds nothing. Never writes or clears the pending journal.
   */
  refresh(): Promise<void> {
    if (this.stopped || !this.envelope.initialized) return Promise.resolve();
    this.refreshPending = true;
    this.refreshing ??= this.runRefresh().finally(() => { this.refreshing = null; });
    return this.refreshing;
  }

  private refreshBlocker(impact?: RefreshImpact): RefreshStatus['reason'] {
    if (this.stopped || !this.envelope.initialized || this.envelope.blocked || this.protection === 'invalid') return 'blocked';
    if (this.isDirty()) return 'unsaved';
    return this.deps.refreshHold?.(impact) ?? null;
  }

  private setRefresh(status: RefreshStatus): void {
    this.refreshStatus = status;
    this.publish(this.status.phase, this.status.message);
  }

  private async runRefresh(): Promise<void> {
    for (let attempt = 0; attempt < REFRESH_READS && !this.stopped; attempt++) {
      // Defer at once if unsaved/held (an inflight save may take long); otherwise wait for the running operation.
      let blocker = this.refreshBlocker();
      while (!blocker && this.running) {
        await this.running;
        blocker = this.refreshBlocker();
      }
      if (blocker) { this.setRefresh({ ...IDLE_REFRESH, state: 'deferred', reason: blocker }); break; }
      const revision = this.revision;
      const activity = this.deps.inputActivity?.();
      let overtaken = false;
      await this.exclusive(async () => {
        this.setRefresh({ ...IDLE_REFRESH, state: 'checking' });
        this.lastRead = Date.now();
        let records: PlannerRecord[];
        try { records = await this.deps.read(); }
        catch (error) { this.refreshFailed(error); return; }
        if (this.stopped) return;
        // Edits (even reverted ones) or input during the read were made on the old content.
        if (revision !== this.revision || activity !== this.deps.inputActivity?.()) { overtaken = true; return; }
        // Unchanged content keeps its identity (shared with the stores), so later edits still skip comparing it.
        const known = new Map(this.envelope.base.map((record) => [recordKey(record), record.data]));
        records = records.map((record) => {
          const data = known.get(recordKey(record));
          return data && record.data && data !== record.data && sameData(data, record.data) ? { ...record, data } : record;
        });
        const documents = mergeDocuments(records);
        const changed = !sameDocuments(documents, this.documents());
        const impact = changed ? this.deps.refreshImpact?.(documents) : undefined;
        const blocked = this.refreshBlocker(impact);
        if (blocked) { this.setRefresh({ ...IDLE_REFRESH, state: 'deferred', reason: blocked, changed }); return; }
        const previous = this.envelope.base;
        if (changed) {
          // Validate the complete copy before touching base or stores.
          try { this.deps.validateDocuments?.(documents); }
          catch { this.refreshFailed(new PlannerSyncError('invalid_response')); return; }
          this.envelope.base = records;
          this.applying = true;
          try { (this.deps.applyRefresh ?? this.deps.apply)(documents); }
          catch {
            this.envelope.base = previous;
            this.refreshFailed(new PlannerSyncError('invalid_response'));
            return;
          } finally { this.applying = false; }
        } else {
          // Same content: newer versions only. No store update, AI/editor reset or write.
          this.envelope.base = records;
        }
        this.refreshPending = false;
        this.refreshStatus = changed ? { ...IDLE_REFRESH, state: 'updated', changed: true, selectionRemoved: !!impact?.selectionRemoved } : IDLE_REFRESH;
        this.publishPending();
      });
      if (!overtaken) break;
      if (attempt === REFRESH_READS - 1) this.setRefresh({ ...IDLE_REFRESH, state: 'deferred', reason: this.refreshBlocker() ?? 'editing' });
    }
    // A debounced save that fired during the read was skipped by exclusive(). Never postpone a pending one.
    if (!this.timer) this.schedule();
  }

  private refreshFailed(error: unknown): void {
    if (this.stopped) return;
    const code = error instanceof PlannerSyncError ? error.code : 'network';
    this.refreshPending = false;
    if (code === 'unauthorized' || code === 'account_changed') {
      this.refreshStatus = { ...IDLE_REFRESH, state: 'deferred', reason: 'blocked' };
      this.fail(error);
      return;
    }
    this.setRefresh({ ...IDLE_REFRESH, state: 'failed', reason: code === 'invalid_response' ? 'invalid' : 'network' });
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
  }
}
