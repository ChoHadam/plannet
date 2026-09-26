import OpenAI from 'openai';
import { NextRequest, NextResponse } from 'next/server';
import { authUserKey } from '@/lib/authContract';
import { apiError } from '@/lib/server/apiErrors';
import {
  CHAT_LIMITS,
  GridState,
  readJsonWithLimit,
  validateChatReply,
  validateChatRequest,
} from '@/lib/server/chatValidation';
import { checkCsrf } from '@/lib/server/csrf';
import { acquireAiQuota } from '@/lib/server/rateLimit';
import { verifySession } from '@/lib/server/sessionVerifier';

// OpenAI Function Calling 정의
const tools: OpenAI.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'respond_to_user',
      description: '사용자에게 응답합니다. action이 generate_actions일 때는 반드시 subGoal과 actions(8개) 배열을 함께 포함해야 합니다.',
      parameters: {
        type: 'object',
        properties: {
          message: {
            type: 'string',
            description: `사용자에게 보여줄 메시지 (한국어). action별 필수 형식:
- generate_actions (assistedCount=0): "'{subGoal}'의 실천 계획을 만들었어요!\\n\\n두 번째 하위 목표도 도와드릴까요?\\n\\n예시: 독서, 저축, 자격증 취득 등"
- generate_actions (assistedCount=1): "'{subGoal}'의 실천 계획도 완성했어요!\\n\\n이제 나머지 하위 목표는 직접 채워보세요."
- 확인 질문 금지! "~해볼까요?", "~할까요?" 형태의 질문 대신 완료형으로 작성`,
          },
          action: {
            type: 'string',
            enum: ['none', 'set_core_goal', 'generate_actions', 'end_conversation'],
            description: '수행할 액션 타입. 사용자가 하위 목표를 언급하면 즉시 generate_actions 사용 (확인 질문 없이!)',
          },
          coreGoal: {
            type: 'string',
            description: '핵심 목표 (action이 set_core_goal일 때만 사용)',
          },
          subGoal: {
            type: 'string',
            description: '하위 목표 (action이 generate_actions일 때만 사용)',
          },
          actions: {
            type: 'array',
            items: { type: 'string' },
            minItems: 8,
            maxItems: 8,
            description: '실천 계획 8개 배열. action이 generate_actions일 때 반드시 포함해야 함! 각 항목은 10자 이내의 구체적이고 실행 가능한 행동. 예: ["아침 스트레칭", "주3회 헬스장", ...]',
          },
        },
        required: ['message', 'action'],
      },
    },
  },
];

// 시스템 프롬프트
const SYSTEM_PROMPT = `당신은 만다라트 목표 설정을 도와주는 친근한 AI 어시스턴트입니다.

<만다라트_설명>
9x9 그리드로 구성된 목표 설정 도구입니다:
- 중앙: 핵심 목표 (1개) - 선택사항, 비어있어도 됨
- 중앙 주변 8칸: 하위 목표 (8개)
- 각 하위 목표별 외곽 그리드: 실천 계획 (8개씩)
</만다라트_설명>

<역할>
사용자와 대화하며 만다라트 작성을 도와주세요. 질문을 주도하며 필요한 정보를 자연스럽게 얻어내세요.
</역할>

<대화_규칙>
1. 항상 한국어로 응답하세요
2. 친근하고 격려하는 톤을 유지하세요
3. 응답은 간결하게 유지하세요
4. 최대 2개의 하위 목표까지만 도와주세요
5. 반드시 respond_to_user 함수를 호출하여 응답하세요
</대화_규칙>

<대화_흐름>
1. 사용자가 핵심 목표를 말하면:
   - action: "set_core_goal", coreGoal: "사용자가 말한 목표"
   - 첫 번째 하위 목표가 뭔지 물어보기 + 예시 포함 (예: 운동, 독서, 저축, 자격증 취득 등)

2. 사용자가 "없음"이라고 하면:
   - action: "none"
   - 첫 번째 하위 목표가 뭔지 물어보기 + 예시 포함 (예: 운동, 독서, 저축, 자격증 취득 등)

3. 사용자가 하위 목표를 말하면 (assistedCount=0일 때):
   - 중간 확인 질문 없이 즉시 generate_actions 실행!
   - action: "generate_actions", subGoal: "하위목표", actions: [8개 실천계획]
   - message 형식: "{하위목표}의 실천 계획을 만들었어요!\n\n두 번째 하위 목표도 도와드릴까요?\n\n예시: 독서, 저축, 자격증 취득 등"

4. 사용자가 두 번째 하위 목표를 말하면 (assistedCount=1일 때):
   - 중간 확인 질문 없이 즉시 generate_actions 실행!
   - action: "generate_actions", subGoal: "하위목표", actions: [8개 실천계획]
   - message 형식: "{하위목표}의 실천 계획도 완성했어요!\n\n이제 나머지 하위 목표는 직접 채워보세요. 분명 좋은 아이디어가 떠오를 거예요!"

5. 2개 완료 후 더 요청하면:
   - action: "end_conversation"
   - 베타 서비스 한계 안내

6. 수정/변경 요청 시 (바꿔줘, 대신, 수정 등):
   - action: "none"
   - 베타 서비스라 수정 불가, 그리드에서 직접 수정 안내

7. 관련 없는 질문 시:
   - action: "none"
   - 만다라트 작성 도우미라고 안내

8. 빈 하위목표 슬롯이 0개일 때 (그리드 꽉 참):
   - action: "none"
   - 모든 슬롯이 채워져 있어서 새로운 목표 추가 불가 안내
   - 기존 목표를 그리드에서 직접 삭제/수정 후 다시 요청하라고 안내

9. 사용자가 "삭제했어", "지웠어", "비웠어" 등 삭제 완료를 알릴 때:
   - 빈 슬롯이 1개 이상이면: action: "none", 새로운 하위 목표 물어보기 + 예시 포함
   - 예시 메시지: "좋아요! 새로운 하위 목표를 채워볼까요?\n\n어떤 하위 목표를 추가하고 싶으세요?\n\n예시: 운동, 독서, 저축, 자격증 취득 등"
</대화_흐름>

<Function_호출_예시>
예시1 - 하위 목표 요청:
사용자: "운동을 하고 싶어"
올바른 응답 (assistedCount=0):
{
  "message": "'운동'의 실천 계획을 만들었어요!\n\n두 번째 하위 목표도 도와드릴까요?\n\n예시: 독서, 저축, 자격증 취득 등",
  "action": "generate_actions",
  "subGoal": "운동",
  "actions": ["아침 스트레칭", "주3회 헬스장", "계단 이용하기", "만보 걷기", "홈트 루틴", "주말 등산", "수영 배우기", "운동 기록"]
}

잘못된 응답 (중간 확인 질문 - 하지 마세요!):
{
  "message": "운동을 하위 목표로 잡아볼까요?",
  "action": "none"
}

예시2 - 삭제 완료 알림 (빈 슬롯이 있을 때):
사용자: "삭제했어" 또는 "지웠어"
올바른 응답:
{
  "message": "좋아요! 새로운 하위 목표를 채워볼까요?\n\n어떤 하위 목표를 추가하고 싶으세요?\n\n예시: 운동, 독서, 저축, 자격증 취득 등",
  "action": "none"
}
</Function_호출_예시>

<중요_규칙>
- 사용자가 하위 목표를 말하면 확인 질문 없이 즉시 generate_actions 실행
- 실천 계획은 각 10자 이내로 구체적이고 실행 가능하게
- 절대 "계획1", "계획2" 같은 플레이스홀더 금지
- assistedCount=0: message에 반드시 "두 번째 하위 목표도 도와드릴까요?" 포함
- assistedCount=1: message에 반드시 "이제 나머지는 직접 채워보세요" 포함
- 하위 목표를 물어볼 때는 반드시 예시 포함 (예: 운동, 독서, 저축, 자격증 취득 등)
</중요_규칙>`;

const GREETING_MESSAGE = "안녕하세요! 만다라트 작성을 도와드릴 AI 어시스턴트예요. (Beta)\n\n먼저, 이루고 싶은 '핵심 목표'가 있으신가요? 예를 들어 '건강한 삶', '커리어 성장' 같은 것이요.\n\n아직 정해지지 않았다면 '없음'이라고 해주셔도 괜찮아요!";
const FALLBACK_REPLY_MESSAGE = '응답을 처리하는 중 문제가 발생했어요. 다시 말씀해주세요.';
const DEFAULT_MODEL = 'anthropic/claude-3-haiku-20240307';
const MAX_OUTPUT_TOKENS = 1024;
const AI_TIMEOUT_MS = 20_000;
const EMPTY_USAGE = { inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUSD: '0' };

// 입력 토큰당 $0.25/1M, 출력 토큰당 $1.25/1M 기준의 추정치
const INPUT_COST_PER_TOKEN = 0.25 / 1_000_000;
const OUTPUT_COST_PER_TOKEN = 1.25 / 1_000_000;

function buildContextMessage(assistedCount: number, gridState?: GridState): string {
  let contextMessage = `[시스템 정보: 현재까지 도움 완료한 하위 목표 수: ${assistedCount}/2]`;

  if (gridState) {
    contextMessage += `\n[그리드 상태: 핵심 목표="${gridState.coreGoal || '없음'}", 빈 하위목표 슬롯=${gridState.emptySubGoalCount}개`;
    if (gridState.existingSubGoals.length > 0) {
      contextMessage += `, 기존 하위목표=[${gridState.existingSubGoals.join(', ')}]`;
    }
    contextMessage += ']';

    // 그리드가 꽉 찼을 때 특별 지시
    if (gridState.emptySubGoalCount === 0) {
      contextMessage += '\n[중요: 모든 하위 목표 슬롯이 꽉 찼습니다! generate_actions나 set_sub_goal 액션을 사용하지 마세요. 사용자에게 기존 목표를 그리드에서 직접 수정/삭제하도록 안내하세요.]';
    }
  }

  return contextMessage;
}

/**
 * 처리 순서가 곧 보안 경계다.
 * CSRF → 서버 세션 검증 → 입력 검증 → 사용 제한 → 외부 AI 호출 → 응답 검증.
 * 앞 단계에서 거부되면 외부 AI를 호출하지 않는다.
 */
export async function POST(req: NextRequest) {
  const csrf = checkCsrf(req);
  if (!csrf.ok) return apiError('csrf_rejected');

  // 브라우저가 보낸 사용자 ID·인증 여부는 보지 않는다. 세션 쿠키로 Spring에 직접 확인한다.
  const session = await verifySession(req);
  if (session.status === 'disabled') return apiError('auth_disabled');
  if (session.status === 'unauthenticated') return apiError('unauthenticated');
  if (session.status === 'unavailable') {
    console.warn('[AI Chat] auth check unavailable:', session.reason);
    return apiError('auth_unavailable');
  }

  const body = await readJsonWithLimit(req, CHAT_LIMITS.maxBodyBytes);
  if (!body.ok) return apiError(body.tooLarge ? 'payload_too_large' : 'invalid_request');

  const parsed = validateChatRequest(body.value);
  if (!parsed.ok) return apiError('invalid_request', { extra: { detail: parsed.error } });
  const { messages, assistedCount, gridState } = parsed.value;

  // 첫 대화인 경우 시작 메시지 반환 (외부 호출 없음)
  if (messages.length === 0) {
    return NextResponse.json({ message: GREETING_MESSAGE, action: 'none', data: {}, usage: EMPTY_USAGE });
  }

  const apiKey = process.env.OPENGATEWAY_API_KEY;
  const baseURL = process.env.OPENGATEWAY_BASE_URL;
  if (!apiKey || !baseURL) return apiError('ai_not_configured');

  const quota = acquireAiQuota(authUserKey(session.user));
  if (!quota.ok) {
    return apiError('rate_limited', {
      headers: { 'Retry-After': String(quota.retryAfterSec) },
      extra: { reason: quota.reason, retryAfterSec: quota.retryAfterSec },
    });
  }

  try {
    // 재시도는 비용을 배로 늘리므로 끈다.
    const openai = new OpenAI({ apiKey, baseURL, timeout: AI_TIMEOUT_MS, maxRetries: 0 });

    const openaiMessages: OpenAI.ChatCompletionMessageParam[] = [
      { role: 'system', content: SYSTEM_PROMPT + '\n\n' + buildContextMessage(assistedCount, gridState) },
      ...messages.map((m): OpenAI.ChatCompletionMessageParam => ({ role: m.role, content: m.content })),
    ];

    const startTime = Date.now();
    const response = await openai.chat.completions.create({
      model: process.env.OPENGATEWAY_MODEL || DEFAULT_MODEL,
      max_tokens: MAX_OUTPUT_TOKENS,
      messages: openaiMessages,
      tools,
      tool_choice: { type: 'function', function: { name: 'respond_to_user' } },
    });

    const inputTokens = response.usage?.prompt_tokens || 0;
    const outputTokens = response.usage?.completion_tokens || 0;
    const usage = {
      inputTokens,
      outputTokens,
      totalTokens: response.usage?.total_tokens || 0,
      latencyMs: Date.now() - startTime,
      estimatedCostUSD: (inputTokens * INPUT_COST_PER_TOKEN + outputTokens * OUTPUT_COST_PER_TOKEN).toFixed(6),
    };
    console.log('[AI Chat Usage]', JSON.stringify(usage));

    const toolCall = response.choices[0]?.message?.tool_calls?.[0];
    if (!toolCall || toolCall.type !== 'function' || toolCall.function.name !== 'respond_to_user') {
      console.error('[AI Error] No function call found');
      return NextResponse.json({ message: FALLBACK_REPLY_MESSAGE, action: 'none', data: {}, usage });
    }

    // 모델 출력도 신뢰하지 않는다. 형태가 어긋나면 그리드에 적용하지 않고 안내만 한다.
    const reply = validateChatReply(toolCall.function.arguments);
    if (!reply.ok) {
      console.error('[AI Error] Invalid function arguments:', reply.error);
      return NextResponse.json({ message: FALLBACK_REPLY_MESSAGE, action: 'none', data: {}, usage });
    }

    return NextResponse.json({ ...reply.value, usage });
  } catch (error) {
    // 내부 오류 문자열은 브라우저로 보내지 않는다.
    console.error('[AI Error]', error instanceof Error ? error.message : error);
    return apiError('ai_failed');
  } finally {
    quota.release();
  }
}
