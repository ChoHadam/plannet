import { renderBrandIcon } from '@/lib/brandIcon';
import { APPLE_ICON_SIZE } from '@/lib/constants';

// iPhone 홈 화면 아이콘. Next가 <link rel="apple-touch-icon">을 붙이고 빌드 때 PNG로 만든다.
export const size = { width: APPLE_ICON_SIZE, height: APPLE_ICON_SIZE };
export const contentType = 'image/png';

export default function AppleIcon() {
  return renderBrandIcon(APPLE_ICON_SIZE);
}
