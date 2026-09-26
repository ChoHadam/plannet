import { MandalartData } from '@/types/mandalart';
import { MAX_MANDALART_JSON_BYTES, MandalartImportError, parseMandalartJSON } from './mandalartImport';
import { renderMandalartImage } from './mandalartImage';

const OBJECT_URL_LIFETIME_MS = 1_000;

function downloadBlob(blob: Blob, title: string, extension: 'json' | 'png'): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  const safeTitle = title.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').slice(0, 120) || 'mandalart';
  link.download = `${safeTitle}-${new Date().toISOString().split('T')[0]}.${extension}`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Let browsers consume the URL before revoking it (including mobile downloads).
  setTimeout(() => URL.revokeObjectURL(url), OBJECT_URL_LIFETIME_MS);
}

export const exportToJSON = (data: MandalartData) => {
  downloadBlob(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), data.title, 'json');
};

export const importFromJSON = (): Promise<MandalartData | null> => new Promise((resolve) => {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json';
  input.hidden = true;
  let settled = false;
  const finish = (data: MandalartData | null) => {
    if (settled) return;
    settled = true;
    input.remove();
    resolve(data);
  };
  input.addEventListener('cancel', () => finish(null), { once: true });
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return finish(null);
    try {
      if (file.size > MAX_MANDALART_JSON_BYTES) throw new MandalartImportError('파일은 2MB 이하여야 합니다.');
      finish(parseMandalartJSON(await file.text()));
    } catch (error) {
      alert(error instanceof MandalartImportError ? error.message : '파일을 읽는 중 오류가 발생했습니다.');
      finish(null);
    }
  }, { once: true });
  document.body.appendChild(input);
  input.click();
});

// The optional snapshot keeps existing two-argument callers compatible. Both layouts share
// a single export root containing the complete plan, never just the mobile center grid.
export const exportToImage = async (elementId: string, filename: string, data?: MandalartData) => {
  try {
    const serialized = data ? undefined : document.getElementById(elementId)?.dataset.mandalartExport;
    const plan = data ?? (serialized ? parseMandalartJSON(serialized) : null);
    if (!plan) {
      alert('내보낼 만다라트를 찾을 수 없습니다.');
      return;
    }
    const canvas = await renderMandalartImage(plan);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(value => value ? resolve(value) : reject(new Error('PNG encoding failed')), 'image/png');
    });
    downloadBlob(blob, filename, 'png');
  } catch {
    alert('이미지 생성 중 오류가 발생했습니다.');
  }
};
