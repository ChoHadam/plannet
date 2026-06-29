import html2canvas from 'html2canvas';
import { MandalartData } from '@/types/mandalart';

// JSON Export
export const exportToJSON = (data: MandalartData) => {
  const jsonString = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = `${data.title || 'mandalart'}-${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

// JSON Import
export const importFromJSON = (): Promise<MandalartData | null> => {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';

    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) {
        resolve(null);
        return;
      }

      try {
        const text = await file.text();
        const data = JSON.parse(text) as MandalartData;

        // Basic validation
        if (!data.grids || !Array.isArray(data.grids)) {
          alert('유효하지 않은 파일 형식입니다.');
          resolve(null);
          return;
        }

        resolve(data);
      } catch {
        alert('파일을 읽는 중 오류가 발생했습니다.');
        resolve(null);
      }
    };

    input.click();
  });
};

// Image Export
export const exportToImage = async (elementId: string, filename: string) => {
  const element = document.getElementById(elementId);
  if (!element) {
    alert('내보낼 요소를 찾을 수 없습니다.');
    return;
  }

  try {
    const canvas = await html2canvas(element, {
      backgroundColor: '#f8fafc',
      scale: 2, // Higher resolution
      logging: false,
    });

    const link = document.createElement('a');
    link.href = canvas.toDataURL('image/png');
    link.download = `${filename || 'mandalart'}-${new Date().toISOString().split('T')[0]}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } catch {
    alert('이미지 생성 중 오류가 발생했습니다.');
  }
};
