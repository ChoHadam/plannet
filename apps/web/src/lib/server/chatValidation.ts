import 'server-only';

/**
 * /api/chat 요청·응답 검증.
 * 외부 AI로 보내는 입력과 브라우저로 돌려주는 출력의 형태·길이를 제한한다.
 */

export const CHAT_LIMITS = {
  maxBodyBytes: 32 * 1024,
  maxMessages: 20,
  maxMessageChars: 500,
  maxTotalChars: 8000,
  maxAssistedCount: 2,
  subGoalSlots: 8,
  maxGoalChars: 100,
  maxReplyChars: 1000,
  actionCount: 8,
  maxActionChars: 30,
} as const;

export const CHAT_ACTIONS = ['none', 'set_core_goal', 'generate_actions', 'end_conversation'] as const;
export type ChatAction = (typeof CHAT_ACTIONS)[number];

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface GridState {
  coreGoal: string;
  emptySubGoalCount: number;
  existingSubGoals: string[];
}

export interface ChatRequest {
  messages: ChatMessage[];
  assistedCount: number;
  gridState?: GridState;
}

export interface ChatReply {
  message: string;
  action: ChatAction;
  data: { coreGoal?: string; subGoal?: string; actions?: string[] };
}

export type Validated<T> = { ok: true; value: T } | { ok: false; error: string };

// 줄바꿈·탭을 제외한 제어 문자
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
// 시스템 프롬프트의 [..], "..." 구획을 깨지 못하게 제거할 문자
const PROMPT_DELIMITERS = /["[\]\r\n]/g;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function cleanText(value: string): string {
  return value.replace(CONTROL_CHARS, '').trim();
}

/** 프롬프트 컨텍스트에 끼워 넣는 짧은 값 (그리드 셀 텍스트) */
function cleanInlineValue(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const cleaned = cleanText(value).replace(PROMPT_DELIMITERS, ' ').trim();
  return cleaned.length <= CHAT_LIMITS.maxGoalChars ? cleaned : null;
}

function isIntInRange(value: unknown, min: number, max: number): value is number {
  return Number.isInteger(value) && (value as number) >= min && (value as number) <= max;
}

function validateGridState(value: unknown): Validated<GridState | undefined> {
  if (value === undefined || value === null) return { ok: true, value: undefined };
  if (!isRecord(value)) return { ok: false, error: 'gridState must be an object' };

  const coreGoal = cleanInlineValue(value.coreGoal ?? '');
  if (coreGoal === null) return { ok: false, error: 'gridState.coreGoal is invalid' };

  if (!isIntInRange(value.emptySubGoalCount, 0, CHAT_LIMITS.subGoalSlots)) {
    return { ok: false, error: 'gridState.emptySubGoalCount is invalid' };
  }

  const rawSubGoals = value.existingSubGoals ?? [];
  if (!Array.isArray(rawSubGoals) || rawSubGoals.length > CHAT_LIMITS.subGoalSlots) {
    return { ok: false, error: 'gridState.existingSubGoals is invalid' };
  }
  const existingSubGoals: string[] = [];
  for (const item of rawSubGoals) {
    const cleaned = cleanInlineValue(item);
    if (cleaned === null) return { ok: false, error: 'gridState.existingSubGoals is invalid' };
    if (cleaned) existingSubGoals.push(cleaned);
  }

  return {
    ok: true,
    value: { coreGoal, emptySubGoalCount: value.emptySubGoalCount, existingSubGoals },
  };
}

export function validateChatRequest(body: unknown): Validated<ChatRequest> {
  if (!isRecord(body)) return { ok: false, error: 'body must be an object' };

  const { messages } = body;
  if (!Array.isArray(messages) || messages.length > CHAT_LIMITS.maxMessages) {
    return { ok: false, error: `messages must be an array of at most ${CHAT_LIMITS.maxMessages}` };
  }

  const cleanedMessages: ChatMessage[] = [];
  let totalChars = 0;
  for (const message of messages) {
    if (!isRecord(message)) return { ok: false, error: 'message must be an object' };
    const { role, content } = message;
    if (role !== 'user' && role !== 'assistant') return { ok: false, error: 'message.role is invalid' };
    if (typeof content !== 'string') return { ok: false, error: 'message.content must be a string' };

    const cleaned = cleanText(content);
    // assistant 메시지는 서버가 만든 안내문(최대 응답 길이)까지 허용한다.
    const maxChars = role === 'user' ? CHAT_LIMITS.maxMessageChars : CHAT_LIMITS.maxReplyChars;
    if (!cleaned || cleaned.length > maxChars) {
      return { ok: false, error: `message.content must be 1-${maxChars} characters` };
    }
    totalChars += cleaned.length;
    cleanedMessages.push({ role, content: cleaned });
  }

  if (totalChars > CHAT_LIMITS.maxTotalChars) {
    return { ok: false, error: 'conversation is too long' };
  }
  if (cleanedMessages.length > 0 && cleanedMessages[cleanedMessages.length - 1].role !== 'user') {
    return { ok: false, error: 'last message must be from the user' };
  }

  const assistedCount = body.assistedCount ?? 0;
  if (!isIntInRange(assistedCount, 0, CHAT_LIMITS.maxAssistedCount)) {
    return { ok: false, error: 'assistedCount is invalid' };
  }

  const gridState = validateGridState(body.gridState);
  if (!gridState.ok) return gridState;

  return {
    ok: true,
    value: { messages: cleanedMessages, assistedCount, gridState: gridState.value },
  };
}

function cleanBoundedString(value: unknown, maxChars: number): string | null {
  if (typeof value !== 'string') return null;
  const cleaned = cleanText(value);
  return cleaned && cleaned.length <= maxChars ? cleaned : null;
}

/** 모델의 function arguments(JSON 문자열)를 검증한다. 형태가 어긋나면 적용하지 않는다. */
export function validateChatReply(rawArguments: string): Validated<ChatReply> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawArguments);
  } catch {
    return { ok: false, error: 'arguments are not valid JSON' };
  }
  if (!isRecord(parsed)) return { ok: false, error: 'arguments must be an object' };

  const message = cleanBoundedString(parsed.message, CHAT_LIMITS.maxReplyChars);
  if (!message) return { ok: false, error: 'message is missing or too long' };

  const action = parsed.action;
  if (typeof action !== 'string' || !(CHAT_ACTIONS as readonly string[]).includes(action)) {
    return { ok: false, error: 'action is invalid' };
  }
  const typedAction = action as ChatAction;
  const data: ChatReply['data'] = {};

  if (typedAction === 'set_core_goal') {
    const coreGoal = cleanBoundedString(parsed.coreGoal, CHAT_LIMITS.maxGoalChars);
    if (!coreGoal) return { ok: false, error: 'coreGoal is invalid' };
    data.coreGoal = coreGoal;
  }

  if (typedAction === 'generate_actions') {
    const subGoal = cleanBoundedString(parsed.subGoal, CHAT_LIMITS.maxGoalChars);
    if (!subGoal) return { ok: false, error: 'subGoal is invalid' };

    const actions = parsed.actions;
    if (!Array.isArray(actions) || actions.length !== CHAT_LIMITS.actionCount) {
      return { ok: false, error: `actions must contain exactly ${CHAT_LIMITS.actionCount} items` };
    }
    const cleanedActions: string[] = [];
    for (const item of actions) {
      const cleaned = cleanBoundedString(item, CHAT_LIMITS.maxActionChars);
      if (!cleaned) return { ok: false, error: 'action item is invalid' };
      cleanedActions.push(cleaned);
    }
    data.subGoal = subGoal;
    data.actions = cleanedActions;
  }

  return { ok: true, value: { message, action: typedAction, data } };
}

/** 본문을 제한된 크기까지만 읽는다. Content-Length를 속여도 초과분에서 중단한다. */
export async function readJsonWithLimit(
  request: Request,
  maxBytes: number,
): Promise<Validated<unknown> & { tooLarge?: boolean }> {
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(declared) && declared > maxBytes) {
    return { ok: false, error: 'body too large', tooLarge: true };
  }
  if (!request.body) return { ok: false, error: 'body is required' };

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > maxBytes) {
      await reader.cancel();
      return { ok: false, error: 'body too large', tooLarge: true };
    }
    chunks.push(value);
  }

  try {
    return { ok: true, value: JSON.parse(Buffer.concat(chunks).toString('utf-8')) };
  } catch {
    return { ok: false, error: 'body must be valid JSON' };
  }
}
