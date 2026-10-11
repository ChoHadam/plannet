import { renderBrandIcon } from '@/lib/brandIcon';
import { MANIFEST_ICON_SIZES } from '@/lib/constants';

// manifest 아이콘(192·512). 빌드 때 정적 PNG로 만들고 다른 이름은 404.
export const dynamic = 'force-static';
export const dynamicParams = false;

export function generateStaticParams() {
  return Object.keys(MANIFEST_ICON_SIZES).map((file) => ({ file }));
}

export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  return renderBrandIcon(MANIFEST_ICON_SIZES[file as keyof typeof MANIFEST_ICON_SIZES]);
}
