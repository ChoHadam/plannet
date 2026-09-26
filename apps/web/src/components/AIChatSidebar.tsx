'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useMandalartStore } from '@/hooks/useMandalart';
import { useAuth } from '@/components/AuthProvider';
import { GridPosition } from '@/types/mandalart';
import { getPlannerStorageScope } from '@/lib/plannerStorage';
import {
  AIRequestContext,
  ChatActionData,
  CORE_GOAL_INDEX,
  findStaleReason,
  planGridAction,
  readCellValue,
  snapshotGridValues,
  SUB_GOAL_POSITIONS,
} from '@/lib/aiResponseSafety';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  action?: string;
  data?: ChatActionData;
}

interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUSD: string;
}

/** 서버 검증 한도와 맞춘다 (lib/server/chatValidation.ts CHAT_LIMITS.maxMessages) */
const MAX_SENT_MESSAGES = 20;
const GENERIC_ERROR_MESSAGE = '죄송해요, 오류가 발생했어요. 다시 시도해주세요.';

interface ChatErrorBody {
  ok: false;
  error: string;
  message?: string;
}

/** 진행 중인 요청. 취소 시 보낸 메시지를 되돌리는 데 쓴다. */
interface PendingRequest {
  context: AIRequestContext;
  controller: AbortController;
  baseMessages: Message[];
  pendingMessages: Message[];
  text: string;
}

type CancelMode = 'restore' | 'discard';

const EMPTY_USAGE: TokenUsage = {
  inputTokens: 0,
  outputTokens: 0,
  totalTokens: 0,
  estimatedCostUSD: '0',
};

/** generate_actions를 이 횟수만큼 도우면 대화를 끝낸다 */
const MAX_ASSISTED_COUNT = 2;

interface AIChatSidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AIChatSidebar({ isOpen, onClose }: AIChatSidebarProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [assistedCount, setAssistedCount] = useState(0);
  const [totalUsage, setTotalUsage] = useState<TokenUsage>(EMPTY_USAGE);
  const [isEnded, setIsEnded] = useState(false);
  // 서버가 401을 돌려주면(세션 만료 등) 로그인 안내로 전환한다.
  const [sessionRejected, setSessionRejected] = useState(false);
  const { status: authStatus, storageScope: authStorageScope, login } = useAuth();
  const canChat = authStatus === 'authenticated' && !sessionRejected;
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 요청 세대. 플랜 전환·초기화·닫기·계정 변경·해제 때마다 올려서 이전 응답을 무효로 만든다.
  const generationRef = useRef(0);
  const pendingRef = useRef<PendingRequest | null>(null);
  const authScopeRef = useRef(authStorageScope);

  const currentId = useMandalartStore((state) => state.currentId);
  const data = useMandalartStore((state) => {
    if (!state.currentId) return null;
    return state.mandalarts.find((m) => m.id === state.currentId) || null;
  });
  const updateCell = useMandalartStore((state) => state.updateCell);

  // 셀 값 조회 헬퍼 (화면 표시용. 요청·응답 처리는 store의 최신 값을 직접 읽는다)
  const getCellValue = useCallback(
    (gridId: GridPosition, cellIndex: number): string => readCellValue(data, gridId, cellIndex),
    [data],
  );

  /** 인증이 알려준 범위와 실제 저장 범위가 같을 때만 그 범위를, 아니면 null */
  const readStorageScope = (): string | null => {
    const scope = getPlannerStorageScope();
    return scope !== null && scope === authScopeRef.current ? scope : null;
  };

  const readCurrentPlan = () => {
    const state = useMandalartStore.getState();
    const plan = state.currentId ? state.mandalarts.find((m) => m.id === state.currentId) ?? null : null;
    return { planId: state.currentId, plan, resetToken: state.resetToken };
  };

  /** 진행 중인 요청을 끊고, 이후 도착하는 응답이 어떤 상태도 바꾸지 못하게 한다. */
  const cancelPendingRequest = useCallback((mode: CancelMode) => {
    generationRef.current += 1;
    const pending = pendingRef.current;
    pendingRef.current = null;
    if (!pending) return;
    pending.controller.abort();
    setIsLoading(false);
    if (mode === 'restore') {
      // 답을 받지 못한 질문은 대화에서 빼고 입력창으로 돌려준다.
      setMessages((prev) => (prev === pending.pendingMessages ? pending.baseMessages : prev));
      setInput((prev) => prev || pending.text);
    }
  }, []);

  // 스크롤 자동 이동
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const resetConversation = useCallback(() => {
    cancelPendingRequest('discard');
    setMessages([]);
    setAssistedCount(0);
    setTotalUsage(EMPTY_USAGE);
    setIsEnded(false);
  }, [cancelPendingRequest]);

  // Invalidate synchronously with the store update, before a response continuation can run.
  // Identity changes survive equal values/timestamps and same-tick A → B → A selections.
  useEffect(() => {
    resetConversation();
    return useMandalartStore.subscribe((state, previous) => {
      if (state.currentId !== previous.currentId || state.resetToken !== previous.resetToken) {
        resetConversation();
      }
    });
  }, [resetConversation]);

  // 계정 저장 범위가 바뀌면 이전 계정 문맥의 요청을 버린다.
  useEffect(() => {
    authScopeRef.current = authStorageScope;
    cancelPendingRequest('discard');
  }, [authStorageScope, cancelPendingRequest]);

  // 닫히면 진행 중인 요청을 취소한다.
  useEffect(() => {
    if (!isOpen) cancelPendingRequest('restore');
  }, [isOpen, cancelPendingRequest]);

  // 로그아웃·로그인 이동 등으로 페이지를 떠나기 시작하면 늦은 응답이 이전 계정 기록을 바꾸지 못하게 한다.
  // 해제될 때도 같은 이유로 세대를 올린다 (해제 후에는 setState하지 않는다).
  useEffect(() => {
    const onLeave = () => {
      generationRef.current += 1;
      pendingRef.current?.controller.abort();
      pendingRef.current = null;
    };
    window.addEventListener('beforeunload', onLeave);
    window.addEventListener('pagehide', onLeave);
    return () => {
      window.removeEventListener('beforeunload', onLeave);
      window.removeEventListener('pagehide', onLeave);
      onLeave();
    };
  }, []);

  const initChat = useCallback(() => {
    // 현재 그리드 상태 확인
    const coreGoal = getCellValue('center', CORE_GOAL_INDEX);
    const emptySlotCount = SUB_GOAL_POSITIONS.filter(
      (pos) => !getCellValue('center', pos)
    ).length;

    let startMessage = '';

    if (coreGoal && emptySlotCount === 0) {
      // 핵심목표도 있고 하위목표도 모두 채워짐
      startMessage = `안녕하세요! 만다라트 작성을 도와드릴 AI 어시스턴트예요. (Beta)\n\n'${coreGoal}' 목표로 하위 목표가 모두 채워져 있네요! 혹시 수정하고 싶은 부분이 있으시면 먼저 그리드에서 삭제해주세요.`;
    } else if (coreGoal && emptySlotCount > 0) {
      // 핵심목표는 있고 하위목표는 비어있는 슬롯 있음
      startMessage = `안녕하세요! 만다라트 작성을 도와드릴 AI 어시스턴트예요. (Beta)\n\n'${coreGoal}' 목표가 이미 설정되어 있네요! 비어있는 하위 목표 ${emptySlotCount}개를 함께 채워볼까요?\n\n첫 번째 하위 목표는 무엇으로 하시겠어요?\n\n예시: 운동, 독서, 자격증 취득, 저축 등`;
    } else {
      // 핵심목표가 비어있음
      startMessage = "안녕하세요! 만다라트 작성을 도와드릴 AI 어시스턴트예요. (Beta)\n\n먼저, 이루고 싶은 '핵심 목표'가 있으신가요?\n\n예시:\n• 건강한 삶\n• 커리어 성장\n• 올해 목표 달성\n• 자기계발\n\n아직 정해지지 않았다면 '없음'이라고 해주셔도 괜찮아요!";
    }

    setMessages([{ role: 'assistant', content: startMessage }]);
  }, [getCellValue]);

  // 사이드바 열릴 때 첫 메시지 가져오기
  useEffect(() => {
    if (isOpen && messages.length === 0) {
      initChat();
    }
  }, [isOpen, currentId, messages.length, initChat]);

  const handleSend = async () => {
    if (!input.trim() || isLoading || isEnded) return;

    const storageScope = readStorageScope();
    const { planId, plan, resetToken } = readCurrentPlan();
    if (!storageScope || !planId || !plan) return;

    const text = input.trim();
    const userMessage: Message = { role: 'user', content: text };
    const baseMessages = messages;
    const newMessages = [...messages, userMessage];

    cancelPendingRequest('discard');
    const context: AIRequestContext = {
      generation: generationRef.current,
      storageScope,
      planId,
      resetToken,
      snapshot: snapshotGridValues(plan),
    };
    const controller = new AbortController();
    pendingRef.current = { context, controller, baseMessages, pendingMessages: newMessages, text };
    const isCurrent = () => generationRef.current === context.generation
      && useMandalartStore.getState().resetToken === context.resetToken;

    setMessages(newMessages);
    setInput('');
    setIsLoading(true);

    try {
      // API에 보낼 메시지 형식으로 변환 (서버 한도에 맞춰 최근 메시지만)
      const apiMessages = newMessages.slice(-MAX_SENT_MESSAGES).map((m) => ({
        role: m.role,
        content: m.content,
      }));

      // 요청 시점의 그리드 상태 정보
      const subGoals = SUB_GOAL_POSITIONS.map((pos) => readCellValue(plan, 'center', pos));
      const gridState = {
        coreGoal: readCellValue(plan, 'center', CORE_GOAL_INDEX),
        emptySubGoalCount: subGoals.filter((value) => !value).length,
        existingSubGoals: subGoals.filter(Boolean),
      };

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: apiMessages, assistedCount, gridState }),
        signal: controller.signal,
      });

      const result = await response.json();

      // 응답 처리 직전: 세대 → 계정 범위 → 플랜을 최신 값으로 다시 확인한다.
      if (!isCurrent()) return;
      const current = readCurrentPlan();
      const staleReason = findStaleReason(context, {
        generation: generationRef.current,
        storageScope: readStorageScope(),
        ...current,
      });
      if (staleReason || !current.plan) {
        cancelPendingRequest('discard');
        return;
      }

      if (!response.ok) {
        const errorBody = result as ChatErrorBody;
        if (errorBody.error === 'unauthenticated') setSessionRejected(true);
        setMessages([
          ...newMessages,
          { role: 'assistant', content: errorBody.message || GENERIC_ERROR_MESSAGE },
        ]);
        return;
      }

      // 토큰 사용량 업데이트
      if (result.usage) {
        setTotalUsage((prev) => ({
          inputTokens: prev.inputTokens + result.usage.inputTokens,
          outputTokens: prev.outputTokens + result.usage.outputTokens,
          totalTokens: prev.totalTokens + result.usage.totalTokens,
          estimatedCostUSD: (
            parseFloat(prev.estimatedCostUSD) +
            parseFloat(result.usage.estimatedCostUSD)
          ).toFixed(6),
        }));
      }

      // 액션 처리: 최신 플랜 기준으로 계산하고, 기다리는 동안 바뀐 칸은 건드리지 않는다.
      const gridAction = planGridAction(result.action, result.data, context.snapshot, current.plan);
      gridAction.writes.forEach(({ gridId, cellIndex, value }) => updateCell(gridId, cellIndex, value));
      if (gridAction.assisted) {
        const newCount = assistedCount + 1;
        setAssistedCount(newCount);
        if (newCount >= MAX_ASSISTED_COUNT) setIsEnded(true);
      }
      if (gridAction.endConversation) setIsEnded(true);

      // AI 응답 추가 (경고가 있으면 메시지에 추가)
      let finalMessage = result.message;
      if (gridAction.notice) {
        finalMessage = `${result.message}\n\n⚠️ ${gridAction.notice}`;
      }

      const assistantMessage: Message = {
        role: 'assistant',
        content: finalMessage,
        action: result.action,
        data: result.data, // 에러 시에도 data 표시 (참고용)
      };
      setMessages([...newMessages, assistantMessage]);
    } catch (error) {
      if (!isCurrent()) return;
      console.error('Failed to send message:', error);
      setMessages([
        ...newMessages,
        { role: 'assistant', content: GENERIC_ERROR_MESSAGE },
      ]);
    } finally {
      // 이전 요청의 finally가 새 요청의 loading을 끄지 않게 한다.
      if (isCurrent()) {
        pendingRef.current = null;
        setIsLoading(false);
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleReset = () => {
    resetConversation();
    initChat();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/20"
        onClick={onClose}
      />

      {/* Sidebar */}
      <div className="relative w-full max-w-md bg-white shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-violet-100 flex items-center justify-center">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="text-violet-600"
              >
                <path d="M12 2a4 4 0 0 1 4 4c0 1.5-.8 2.8-2 3.4V12h2a4 4 0 0 1 4 4 4 4 0 0 1-4 4h-8a4 4 0 0 1-4-4 4 4 0 0 1 4-4h2V9.4A4 4 0 0 1 12 2z" />
              </svg>
            </div>
            <div>
              <h2 className="font-semibold text-slate-800">AI 어시스턴트</h2>
              <span className="text-xs px-1.5 py-0.5 bg-violet-100 text-violet-700 rounded">Beta</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((message, index) => (
            <div
              key={index}
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`
                  max-w-[85%] rounded-2xl px-4 py-2.5
                  ${message.role === 'user'
                    ? 'bg-violet-500 text-white rounded-br-md'
                    : 'bg-slate-100 text-slate-800 rounded-bl-md'}
                `}
              >
                <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                {message.action === 'generate_actions' && message.data?.actions && (
                  <div className="mt-2 pt-2 border-t border-slate-200/50">
                    <p className="text-xs font-medium mb-1 opacity-70">
                      {message.content.includes('⚠️') ? '생성된 실천 계획 (참고용):' : '적용된 실천 계획:'}
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {message.data.actions.map((action, i) => (
                        <span
                          key={i}
                          className="text-xs px-2 py-0.5 bg-white/20 rounded"
                        >
                          {action}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-slate-100 rounded-2xl rounded-bl-md px-4 py-3">
                <div className="flex gap-1">
                  <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Token Usage */}
        {totalUsage.totalTokens > 0 && (
          <div className="px-4 py-2 bg-slate-50 border-t border-slate-100 text-xs text-slate-500">
            <div className="flex justify-between">
              <span>토큰: {totalUsage.totalTokens}</span>
              <span>비용: ${totalUsage.estimatedCostUSD} (~{(parseFloat(totalUsage.estimatedCostUSD) * 1400).toFixed(1)}원)</span>
            </div>
          </div>
        )}

        {/* Input */}
        <div className="p-4 border-t border-slate-200">
          {!canChat ? (
            <ChatLoginNotice authStatus={authStatus} onLogin={login} />
          ) : isEnded ? (
            <div className="text-center">
              <p className="text-sm text-slate-500 mb-3">대화가 종료되었습니다</p>
              <button
                onClick={handleReset}
                className="px-4 py-2 bg-violet-500 text-white rounded-lg text-sm font-medium hover:bg-violet-600 transition-colors"
              >
                새로운 대화 시작
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="메시지를 입력하세요..."
                disabled={isLoading}
                className="
                  flex-1 px-4 py-2.5 rounded-xl
                  bg-slate-100 border-none outline-none
                  text-sm text-slate-800
                  placeholder:text-slate-400
                  focus:ring-2 focus:ring-violet-500/50
                  disabled:opacity-50
                "
              />
              <button
                onClick={handleSend}
                disabled={isLoading || !input.trim()}
                className="
                  px-4 py-2.5 rounded-xl
                  bg-violet-500 text-white
                  hover:bg-violet-600
                  disabled:opacity-50 disabled:cursor-not-allowed
                  transition-colors
                "
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ChatLoginNotice({
  authStatus,
  onLogin,
}: {
  authStatus: ReturnType<typeof useAuth>['status'];
  onLogin: () => void;
}) {
  if (authStatus === 'disabled') {
    return <p className="text-center text-xs text-slate-500">이 환경에서는 AI 어시스턴트를 사용할 수 없어요.</p>;
  }
  if (authStatus === 'unavailable' || authStatus === 'loading') {
    return <p className="text-center text-xs text-slate-500">로그인 상태를 확인할 수 없어 AI 어시스턴트를 쓸 수 없어요.</p>;
  }
  return (
    <div className="text-center">
      <p className="text-xs text-slate-500 mb-3">AI 어시스턴트는 로그인 후 사용할 수 있어요.</p>
      <button
        type="button"
        onClick={onLogin}
        className="px-4 py-2 bg-violet-500 text-white rounded-lg text-sm font-medium hover:bg-violet-600 transition-colors"
      >
        Google 로그인
      </button>
    </div>
  );
}
