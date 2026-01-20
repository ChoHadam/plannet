import Anthropic from '@anthropic-ai/sdk';
import { NextRequest, NextResponse } from 'next/server';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || '',
});

// Tool 정의 - API 레벨에서 JSON 스키마 보장
const tools: Anthropic.Tool[] = [
  {
    name: 'respond_to_user',
    description: '사용자에게 응답합니다. action이 generate_actions일 때는 반드시 subGoal과 actions(8개) 배열을 함께 포함해야 합니다.',
    input_schema: {
      type: 'object' as const,
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
];

// 시스템 프롬프트 - JSON 형식 관련 지시 제거 (Tool Use가 처리)
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
5. 반드시 respond_to_user 도구를 사용하여 응답하세요
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

<Tool_호출_예시>
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
</Tool_호출_예시>

<중요_규칙>
- 사용자가 하위 목표를 말하면 확인 질문 없이 즉시 generate_actions 실행
- 실천 계획은 각 10자 이내로 구체적이고 실행 가능하게
- 절대 "계획1", "계획2" 같은 플레이스홀더 금지
- assistedCount=0: message에 반드시 "두 번째 하위 목표도 도와드릴까요?" 포함
- assistedCount=1: message에 반드시 "이제 나머지는 직접 채워보세요" 포함
- 하위 목표를 물어볼 때는 반드시 예시 포함 (예: 운동, 독서, 저축, 자격증 취득 등)
</중요_규칙>`;

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface ToolInput {
  message: string;
  action: 'none' | 'set_core_goal' | 'generate_actions' | 'end_conversation';
  coreGoal?: string;
  subGoal?: string;
  actions?: string[];
}

interface GridState {
  coreGoal: string;
  emptySubGoalCount: number;
  existingSubGoals: string[];
}

export async function POST(req: NextRequest) {
  try {
    const { messages, assistedCount = 0, gridState } = await req.json() as {
      messages: Message[];
      assistedCount: number;
      gridState?: GridState;
    };

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: 'API key not configured' },
        { status: 500 }
      );
    }

    // 첫 대화인 경우 시작 메시지 반환
    if (!messages || messages.length === 0) {
      return NextResponse.json({
        message: "안녕하세요! 만다라트 작성을 도와드릴 AI 어시스턴트예요. (Beta)\n\n먼저, 이루고 싶은 '핵심 목표'가 있으신가요? 예를 들어 '건강한 삶', '커리어 성장' 같은 것이요.\n\n아직 정해지지 않았다면 '없음'이라고 해주셔도 괜찮아요!",
        action: 'none',
        data: {},
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUSD: '0' },
      });
    }

    // 대화 컨텍스트에 assistedCount와 그리드 상태 추가
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

    const startTime = Date.now();

    const response = await anthropic.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 1024,
      system: SYSTEM_PROMPT + '\n\n' + contextMessage,
      tools,
      tool_choice: { type: 'tool', name: 'respond_to_user' }, // 항상 이 도구 사용 강제
      messages: messages.map((m: Message) => ({
        role: m.role,
        content: m.content,
      })),
    });

    const endTime = Date.now();

    // 토큰 사용량
    const usage = {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      totalTokens: response.usage.input_tokens + response.usage.output_tokens,
      latencyMs: endTime - startTime,
      estimatedCostUSD: (
        (response.usage.input_tokens * 0.25) / 1_000_000 +
        (response.usage.output_tokens * 1.25) / 1_000_000
      ).toFixed(6),
    };

    console.log('[AI Chat Usage]', JSON.stringify(usage, null, 2));

    // Tool Use 응답 처리
    const toolUseBlock = response.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
    );

    if (!toolUseBlock || toolUseBlock.name !== 'respond_to_user') {
      console.error('[AI Error] No tool_use block found:', response.content);
      return NextResponse.json({
        message: '죄송해요, 응답 처리 중 문제가 발생했어요. 다시 말씀해주시겠어요?',
        action: 'none',
        data: {},
        usage,
      });
    }

    // Tool input은 이미 유효한 JSON 객체
    const input = toolUseBlock.input as ToolInput;

    // 디버깅: Tool 응답 전체 로깅
    console.log('[AI Tool Response]', JSON.stringify(input, null, 2));

    // message 누락 체크
    if (!input.message) {
      console.error('[AI Warning] message is missing from tool response!', input);
      return NextResponse.json({
        message: '응답을 처리하는 중 문제가 발생했어요. 다시 말씀해주세요.',
        action: 'none',
        data: {},
        usage,
      });
    }

    // 응답 형식 변환 (기존 프론트엔드와 호환)
    const responseData: {
      message: string;
      action: string;
      data: {
        coreGoal?: string;
        subGoal?: string;
        actions?: string[];
      };
      usage: typeof usage;
    } = {
      message: input.message,
      action: input.action,
      data: {},
      usage,
    };

    // 액션에 따라 data 구성
    if (input.action === 'set_core_goal' && input.coreGoal) {
      responseData.data.coreGoal = input.coreGoal;
    } else if (input.action === 'generate_actions') {
      if (input.subGoal) responseData.data.subGoal = input.subGoal;
      if (input.actions && input.actions.length > 0) {
        responseData.data.actions = input.actions;
      } else {
        // actions가 누락된 경우 경고 로그 및 에러 응답
        console.error('[AI Warning] generate_actions called but actions array is missing or empty!', input);
        return NextResponse.json({
          message: '실천 계획 생성 중 문제가 발생했어요. 다시 시도해주세요.',
          action: 'none',
          data: {},
          usage,
        });
      }
    }

    return NextResponse.json(responseData);
  } catch (error) {
    console.error('[AI Error]', error);
    return NextResponse.json(
      { error: 'AI request failed', message: String(error) },
      { status: 500 }
    );
  }
}
