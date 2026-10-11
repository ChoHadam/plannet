import { ImageResponse } from 'next/og';
import { BRAND_COLORS } from '@/lib/constants';

/**
 * 홈 화면 아이콘을 코드로 그린다: 로그인 랜딩의 3×3 워드마크(indigo 테두리·흰 칸·가운데 indigo).
 * 외부 이미지·글꼴 없이 빌드 때 PNG로 만든다 (app/apple-icon.tsx, app/icons/[file]/route.tsx).
 */

// 격자 한 변 비율. maskable 원형 안전 영역(지름 80%)에 내접하는 정사각형(약 56.6%) 안에 들어간다.
const GRID_RATIO = 0.56;
const GAP_RATIO = 0.035;

export function renderBrandIcon(size: number): ImageResponse {
  const grid = Math.round(size * GRID_RATIO);
  const gap = Math.max(1, Math.round(size * GAP_RATIO));
  const cell = Math.floor((grid - gap * 4) / 3);
  const inner = cell * 3 + gap * 4;
  const radius = Math.round(inner * 0.16);

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%', height: '100%', display: 'flex',
          alignItems: 'center', justifyContent: 'center', background: BRAND_COLORS.background,
        }}
      >
        <div
          style={{
            width: inner, height: inner, display: 'flex', flexDirection: 'column',
            padding: gap, gap, background: BRAND_COLORS.frame, borderRadius: radius,
          }}
        >
          {[0, 1, 2].map((row) => (
            <div key={row} style={{ display: 'flex', gap }}>
              {[0, 1, 2].map((col) => (
                <div
                  key={col}
                  style={{
                    width: cell, height: cell, borderRadius: Math.round(cell * 0.12),
                    background: row === 1 && col === 1 ? BRAND_COLORS.center : BRAND_COLORS.cell,
                  }}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    ),
    { width: size, height: size },
  );
}
