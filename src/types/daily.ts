import { PlanCategory } from './mandalart';

export interface DailyTodo {
  id: string;
  text: string;
  completed: boolean;
  // 선택적 연동 정보 (출처 추적)
  sourceType?: 'monthly' | 'block6' | 'mandalart';
  sourceId?: string;      // 원본 플랜 ID
  sourceCellId?: string;  // 원본 셀/블록 ID
}

export interface DailyData {
  id: string;
  template: 'daily';
  category: PlanCategory;
  title: string;
  year: number;
  month: number;
  day: number;
  todos: DailyTodo[];
  memo: string;
  createdAt: string;
  updatedAt: string;
}

// 요일 라벨
export const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

// 초기 Daily 데이터 생성
export const createInitialDaily = (
  category: PlanCategory,
  year?: number,
  month?: number,
  day?: number
): Omit<DailyData, 'id' | 'createdAt' | 'updatedAt'> => {
  const now = new Date();
  return {
    template: 'daily',
    category,
    title: '',
    year: year ?? now.getFullYear(),
    month: month ?? now.getMonth() + 1,
    day: day ?? now.getDate(),
    todos: [],
    memo: '',
  };
};
