'use client';

import EmojiPicker, { EmojiClickData, Theme } from 'emoji-picker-react';

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
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/20"
        onClick={onClose}
      />
      <div className="relative bg-white rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
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
          theme={Theme.LIGHT}
          width={350}
          height={400}
          searchPlaceholder="이모지 검색..."
          previewConfig={{ showPreview: false }}
        />
      </div>
    </div>
  );
}
