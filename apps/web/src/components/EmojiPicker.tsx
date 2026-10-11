'use client';

import type { EmojiClickData } from 'emoji-picker-react';
import { lazyComponent } from '@/lib/lazyComponent';

const EMOJI_PICKER_WIDTH = 350;
const EMOJI_PICKER_HEIGHT = 400;
const PICKER_BOX = { width: EMOJI_PICKER_WIDTH, height: EMOJI_PICKER_HEIGHT };
const PICKER_STATUS = 'flex items-center justify-center text-xs text-slate-400';

// 이모지 데이터(가장 큰 의존성)는 선택 창을 처음 열 때 받는다. 도착하면 검색창에 초점이 간다.
const EmojiPicker = lazyComponent(
  () => import('emoji-picker-react').then((m) => m.default),
  <div role="status" style={PICKER_BOX} className={PICKER_STATUS}>이모지를 불러오는 중...</div>,
  <div role="status" style={PICKER_BOX} className={PICKER_STATUS}>이모지를 불러오지 못했어요. 닫았다가 다시 열어주세요.</div>,
);

interface EmojiPickerWrapperProps {
  currentEmoji?: string;
  onSelect: (emoji: string | null) => void;
  onClose: () => void;
}

export function EmojiPickerWrapper({
  currentEmoji,
  onSelect,
  onClose,
}: EmojiPickerWrapperProps) {
  const handleEmojiClick = (emojiData: EmojiClickData) => {
    onSelect(emojiData.emoji);
    onClose();
  };

  const handleRemove = () => {
    onSelect(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 overlay-safe z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/20"
        onClick={onClose}
      />
      <div className="relative bg-white rounded-2xl shadow-2xl overflow-hidden max-h-full flex flex-col animate-in fade-in zoom-in duration-200">
        <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-slate-600">이모지 선택</span>
            {currentEmoji && (
              <span className="text-lg">{currentEmoji}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {currentEmoji && (
              <button
                onClick={handleRemove}
                className="px-3 py-1.5 text-sm font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors"
              >
                제거
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
        </div>
        <EmojiPicker
          onEmojiClick={handleEmojiClick}
          width={EMOJI_PICKER_WIDTH}
          height={EMOJI_PICKER_HEIGHT}
          searchPlaceholder="이모지 검색..."
          previewConfig={{ showPreview: false }}
        />
      </div>
    </div>
  );
}
