import type { MetadataRoute } from 'next';
import { BRAND_COLORS, MANIFEST_ICON_SIZES } from '@/lib/constants';

/**
 * 홈 화면 앱 정보. 같은 사이트를 독립 창으로 여는 것뿐이다:
 * 서비스 워커·오프라인 캐시·푸시가 없고, 기록은 계속 로그인한 계정의 서버 저장소에만 저장된다.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Plannet',
    short_name: 'Plannet',
    description: '만다라트·월간·Block 6·일간 플래너',
    lang: 'ko',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: BRAND_COLORS.background,
    theme_color: BRAND_COLORS.background,
    icons: [
      ...Object.entries(MANIFEST_ICON_SIZES).map(([file, size]) => ({
        src: `/icons/${file}`, sizes: `${size}x${size}`, type: 'image/png', purpose: 'any' as const,
      })),
      // 격자가 원형 안전 영역 안에 있어 같은 그림을 maskable로도 쓴다.
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
