# Plannet 로드맵

## 비전
다양한 템플릿으로 연간, 월간, 일간 목표를 체계적으로 관리할 수 있는 플래너 플랫폼

---

## 핵심 구조

### 세 가지 섹션
| 섹션 | 설명 | 연간 최소 등록 개수 |
|------|------|-------------------|
| **Annual Plans** | 연간 목표 및 비전 | 1개 |
| **Monthly Plans** | 월간 목표 | 12개 (월 1개) |
| **Daily Plans** | 일일 할 일 및 습관 | 365개 (일 1개) |

### Plan & Template 시스템
- 각 섹션에 **여러 개의 Plan** 등록 가능
- 각 Plan은 **템플릿을 선택**해서 생성
- 템플릿은 여러 Plan 타입에서 재사용 가능

---

## 템플릿 목록

| 템플릿 | 추천 섹션 | 상태 |
|--------|----------|------|
| **만다라트 (Mandalart)** | Annual Plans | ✅ MVP 완료 |
| 주간 플래너 (Weekly Planner) | Monthly Plans | 🔜 예정 |
| 일일 체크리스트 (Daily Checklist) | Daily Plans | 🔜 예정 |
| 칸반 보드 (Kanban Board) | 전체 | 💡 아이디어 |
| 습관 트래커 (Habit Tracker) | Monthly/Daily | 💡 아이디어 |
| 목표 트래커 (Goal Tracker) | Annual/Monthly | 💡 아이디어 |

---

## 캘린더 시각화

### 개요
모든 Plan은 **캘린더 뷰**로 시각화되어, 사용자가 꾸준히 Plan을 채우도록 유도

### 동기부여 이벤트 (Gamification)

#### 기본 상태 (Plan 미등록)
- 캘린더 배경: **흰색**
- 글자 색상: **회색**
- 장식 없음

#### Annual Plan 등록 시
- 캘린더에 **테두리 디자인/프레임** 생성
- 년도 숫자 (예: "2025")에 **색상 적용**

#### Monthly Plan 등록 시
- 해당 월 숫자에 **색상 적용**
- 예: 1월 Plan 등록 → "1" 또는 "Jan"에 색상

#### Daily Plan 등록 시
- 해당 날짜 칸에 **수채화 스타일 배경** 적용
- 날짜를 채울수록 그림이 완성되는 느낌

### 시각적 진행 예시
```
빈 캘린더 → 흰색 배경, 회색 글자
     ↓
Annual Plan 등록 → 테두리 생성, "2025" 컬러
     ↓
Monthly Plans 등록 → 월 라벨들이 하나씩 컬러로
     ↓
Daily Plans 등록 → 날짜 칸들이 수채화 색상으로 채워짐
     ↓
1년 완성 → 아름다운 캘린더 아트워크 완성
```

---

## 향후 이벤트 아이디어
- [ ] 연속 등록 보상 (7일, 30일, 100일 streak)
- [ ] 월간 완료 뱃지
- [ ] 연말 리뷰/요약 자동 생성
- [ ] 캘린더 이미지로 공유
- [ ] 계절 테마 (봄 색상, 가을 색상 등)
- [ ] 업적 시스템 (Achievement unlocks)

---

## 기술적 고려사항

### 데이터 구조 (초안)
```typescript
interface Plan {
  id: string;
  type: 'annual' | 'monthly' | 'daily';
  templateType: 'mandalart' | 'weekly' | 'checklist' | ...;
  templateData: any; // 템플릿별 데이터
  year: number;
  month?: number;  // monthly/daily용
  day?: number;    // daily 전용
  createdAt: string;
  updatedAt: string;
}

interface UserData {
  plans: Plan[];
  settings: UserSettings;
}
```

### URL 구조 (초안)
```
/                           → 홈 (캘린더 오버뷰)
/plans/annual/:year         → 해당 연도 Annual Plans
/plans/monthly/:year/:month → 해당 월 Monthly Plans
/plans/daily/:year/:month/:day → 해당 일 Daily Plans
/templates/mandalart        → 만다라트 템플릿 (독립 실행)
```

---

## 개발 단계

### Phase 1: 기반 구축 (현재)
- [x] 만다라트 템플릿 MVP
- [x] LocalStorage 자동 저장
- [x] 색상 커스터마이징
- [ ] 멀티 템플릿 지원을 위한 프로젝트 구조 개편

### Phase 2: 캘린더 & 섹션
- [ ] 캘린더 뷰 컴포넌트
- [ ] Annual/Monthly/Daily 섹션
- [ ] Plan 등록 플로우
- [ ] 기본 동기부여 이벤트 (색상 변화)

### Phase 3: 추가 템플릿
- [ ] 주간 플래너 템플릿
- [ ] 일일 체크리스트 템플릿
- [ ] 템플릿 선택 UI

### Phase 4: 폴리싱 & 추가 기능
- [ ] 업적/뱃지 시스템
- [ ] 내보내기/공유 기능
- [ ] 사용자 인증 (선택)
- [ ] 클라우드 동기화 (선택)

---

## 메모
- 처음엔 심플하게, 나중에 복잡도 추가
- 동기부여와 시각적 피드백에 집중
- 모바일 친화적 디자인 중요
