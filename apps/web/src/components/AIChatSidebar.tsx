'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useMandalartStore } from '@/hooks/useMandalart';
import { GridPosition, CENTER_TO_OUTER_MAP } from '@/types/mandalart';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  action?: string;
  data?: {
    coreGoal?: string;
    subGoal?: string;
    subGoalIndex?: number;
    actions?: string[];
  };
}

interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUSD: string;
}

interface AIChatSidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AIChatSidebar({ isOpen, onClose }: AIChatSidebarProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [assistedCount, setAssistedCount] = useState(0);
  const [totalUsage, setTotalUsage] = useState<TokenUsage>({
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    estimatedCostUSD: '0',
  });
  const [isEnded, setIsEnded] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const currentId = useMandalartStore((state) => state.currentId);
  const data = useMandalartStore((state) => {
    if (!state.currentId) return null;
    return state.mandalarts.find((m) => m.id === state.currentId) || null;
  });
  const updateCell = useMandalartStore((state) => state.updateCell);

  // 셀 값 조회 헬퍼
  const getCellValue = useCallback((gridId: GridPosition, cellIndex: number): string => {
    const grid = data?.grids.find((g) => g.id === gridId);
    return grid?.cells[cellIndex]?.value?.trim() || '';
  }, [data]);

  // 빈 하위목표 슬롯 찾기
  const findEmptySubGoalSlot = (): number | null => {
    const positions = [0, 1, 2, 3, 5, 6, 7, 8];
    for (const pos of positions) {
      if (!getCellValue('center', pos)) {
        return pos;
      }
    }
    return null;
  };

  // 스크롤 자동 이동
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // 만다라트가 변경되면 채팅 초기화
  useEffect(() => {
    setMessages([]);
    setAssistedCount(0);
    setTotalUsage({
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      estimatedCostUSD: '0',
    });
    setIsEnded(false);
  }, [currentId]);

  const initChat = useCallback(() => {
    // 현재 그리드 상태 확인
    const coreGoal = getCellValue('center', 4);
    const emptySlotCount = [0, 1, 2, 3, 5, 6, 7, 8].filter(
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

    const userMessage: Message = { role: 'user', content: input.trim() };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput('');
    setIsLoading(true);

    try {
      // API에 보낼 메시지 형식으로 변환
      const apiMessages = newMessages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      // 현재 그리드 상태 정보
      const gridState = {
        coreGoal: getCellValue('center', 4),
        emptySubGoalCount: [0, 1, 2, 3, 5, 6, 7, 8].filter(
          (pos) => !getCellValue('center', pos)
        ).length,
        existingSubGoals: [0, 1, 2, 3, 5, 6, 7, 8]
          .map((pos) => getCellValue('center', pos))
          .filter(Boolean),
      };

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: apiMessages, assistedCount, gridState }),
      });

      const result = await response.json();

      if (result.error) {
        setMessages([
          ...newMessages,
          { role: 'assistant', content: `오류가 발생했어요: ${result.error}` },
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

      // 액션 처리 (에러 메시지 반환 가능)
      const actionError = handleAction(result.action, result.data);

      // AI 응답 추가 (에러가 있으면 메시지에 추가)
      let finalMessage = result.message;
      if (actionError) {
        finalMessage = `${result.message}\n\n⚠️ ${actionError}`;
      }

      const assistantMessage: Message = {
        role: 'assistant',
        content: finalMessage,
        action: result.action,
        data: result.data, // 에러 시에도 data 표시 (참고용)
      };
      setMessages([...newMessages, assistantMessage]);
    } catch (error) {
      console.error('Failed to send message:', error);
      setMessages([
        ...newMessages,
        { role: 'assistant', content: '죄송해요, 오류가 발생했어요. 다시 시도해주세요.' },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAction = (action: string, actionData: Message['data']): string | null => {
    if (!data || !actionData) return null;

    switch (action) {
      case 'set_core_goal':
        if (actionData.coreGoal) {
          // 핵심 목표가 비어있을 때만 설정
          if (!getCellValue('center', 4)) {
            updateCell('center', 4, actionData.coreGoal);
          }
        }
        break;

      case 'set_sub_goal':
        if (actionData.subGoal) {
          const emptySlot = findEmptySubGoalSlot();
          if (emptySlot !== null) {
            updateCell('center', emptySlot, actionData.subGoal);
          } else {
            return '모든 하위 목표 슬롯이 이미 채워져 있어요. 기존 목표를 수정하거나 삭제해주세요.';
          }
        }
        break;

      case 'generate_actions':
        if (actionData.subGoal && actionData.actions) {
          const positions = [0, 1, 2, 3, 5, 6, 7, 8];

          // 빈 하위목표 슬롯 찾기
          const emptySlot = findEmptySubGoalSlot();

          if (emptySlot === null) {
            return '비어있는 하위 목표가 없어서 그리드 채우기를 하지 않았어요. 기존 목표를 수정하거나 삭제해주세요.';
          }

          // 빈 슬롯에 하위 목표 설정
          updateCell('center', emptySlot, actionData.subGoal);

          // 외곽 그리드에 실천 계획 채우기
          const outerGridId = CENTER_TO_OUTER_MAP[emptySlot] as GridPosition;

          // 외곽 그리드 중앙에 하위 목표 설정
          updateCell(outerGridId, 4, actionData.subGoal);

          // 실천 계획 8개 채우기 (AI가 생성한 내용으로 덮어쓰기)
          actionData.actions.forEach((actionItem, idx) => {
            if (idx < 8) {
              const actionCellIndex = positions[idx];
              updateCell(outerGridId, actionCellIndex, actionItem);
            }
          });

          const newCount = assistedCount + 1;
          setAssistedCount(newCount);

          // 2개 완료 시 대화 종료
          if (newCount >= 2) {
            setIsEnded(true);
          }
        }
        break;

      case 'end_conversation':
        setIsEnded(true);
        break;
    }

    return null;
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleReset = () => {
    setMessages([]);
    setAssistedCount(0);
    setTotalUsage({
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      estimatedCostUSD: '0',
    });
    setIsEnded(false);
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
          {isEnded ? (
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
