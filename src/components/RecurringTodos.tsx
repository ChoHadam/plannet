'use client';

import { useState, useRef, KeyboardEvent } from 'react';
import { useRecurringStore } from '@/hooks/useRecurring';

interface RecurringTodosModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (texts: string[]) => void;
}

export function RecurringTodosModal({ isOpen, onClose, onImport }: RecurringTodosModalProps) {
  const todos = useRecurringStore((s) => s.todos);
  const addTodo = useRecurringStore((s) => s.addTodo);
  const updateTodo = useRecurringStore((s) => s.updateTodo);
  const deleteTodo = useRecurringStore((s) => s.deleteTodo);

  const [newText, setNewText] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleAdd = () => {
    if (!newText.trim()) return;
    addTodo(newText);
    setNewText('');
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAdd();
    }
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  };

  const toggleAll = () => {
    if (selected.size === todos.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(todos.map(t => t.id)));
    }
  };

  const handleImport = () => {
    const texts = todos.filter(t => selected.has(t.id)).map(t => t.text);
    if (texts.length > 0) {
      onImport(texts);
      setSelected(new Set());
      onClose();
    }
  };

  const handleEditSave = () => {
    if (editingId && editText.trim()) {
      updateTodo(editingId, editText);
    }
    setEditingId(null);
    setEditText('');
  };

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-md w-full max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-100">
          <h2 className="text-lg font-semibold text-slate-800">고정 할일</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Add input */}
        <div className="p-4 border-b border-slate-100">
          <div className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={newText}
              onChange={(e) => setNewText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="고정 할일 추가..."
              className="flex-1 px-3 py-2 rounded-lg bg-slate-50 border border-slate-200
                       text-sm text-slate-700 placeholder:text-slate-400
                       focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500"
            />
            <button
              onClick={handleAdd}
              disabled={!newText.trim()}
              className="px-3 py-2 rounded-lg bg-slate-800 text-white text-sm font-medium
                       hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              추가
            </button>
          </div>
          <p className="text-xs text-slate-400 mt-2">
            매번 반복되는 할일을 등록하면 플랜 생성 시 바로 불러올 수 있습니다
          </p>
        </div>

        {/* Todo list */}
        <div className="flex-1 overflow-y-auto p-4">
          {todos.length === 0 ? (
            <div className="text-center py-8 text-slate-400 text-sm">
              아직 등록된 고정 할일이 없습니다
            </div>
          ) : (
            <>
              {/* Select all */}
              <button
                onClick={toggleAll}
                className="text-xs text-slate-500 hover:text-slate-700 mb-2 transition-colors"
              >
                {selected.size === todos.length ? '전체 해제' : '전체 선택'}
              </button>

              <div className="space-y-1">
                {todos.map((todo) => (
                  <div
                    key={todo.id}
                    className="group flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-slate-50 transition-colors"
                  >
                    {/* Checkbox */}
                    <input
                      type="checkbox"
                      checked={selected.has(todo.id)}
                      onChange={() => toggleSelect(todo.id)}
                      className="w-4 h-4 rounded border-slate-300 text-blue-500 focus:ring-blue-500"
                    />

                    {/* Text */}
                    {editingId === todo.id ? (
                      <input
                        type="text"
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        onBlur={handleEditSave}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleEditSave();
                          if (e.key === 'Escape') { setEditingId(null); setEditText(''); }
                        }}
                        autoFocus
                        className="flex-1 px-2 py-1 rounded border border-blue-500 text-sm focus:outline-none"
                      />
                    ) : (
                      <span
                        onClick={() => { setEditingId(todo.id); setEditText(todo.text); }}
                        className="flex-1 text-sm text-slate-700 cursor-text"
                      >
                        {todo.text}
                      </span>
                    )}

                    {/* Delete */}
                    <button
                      onClick={() => deleteTodo(todo.id)}
                      className="opacity-0 group-hover:opacity-100 p-1 rounded text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 flex items-center justify-between">
          <span className="text-xs text-slate-400">
            {selected.size > 0 ? `${selected.size}개 선택됨` : `${todos.length}개 등록됨`}
          </span>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            >
              닫기
            </button>
            <button
              onClick={handleImport}
              disabled={selected.size === 0}
              className="px-4 py-2 text-sm bg-slate-800 text-white rounded-lg hover:bg-slate-700
                       disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {selected.size}개 불러오기
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
