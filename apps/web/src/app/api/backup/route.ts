import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { isLocalBackupEnabled } from '@/lib/featureFlags';
import { apiError } from '@/lib/server/apiErrors';
import { checkCsrf } from '@/lib/server/csrf';

/**
 * 로컬 개발용 서버 파일 백업.
 * 사용자 구분 없는 공용 저장소이므로 공개 환경에서는 GET/POST 모두 서버에서 거부한다.
 * 허용 조건은 isLocalBackupEnabled() 참고. UI 숨김이나 브라우저 opt-in에 의존하지 않는다.
 */

// 요청마다 환경변수를 다시 읽도록 정적 최적화를 끈다.
export const dynamic = 'force-dynamic';

// 빌드 추적에서의 제외는 next.config.ts outputFileTracingExcludes 참고
const BACKUP_DIR = process.env.LOCAL_BACKUP_DIR || path.join(process.cwd(), '.local-backup');
const MAX_BACKUPS = 20;
const MAX_BACKUP_BYTES = 10 * 1024 * 1024;

function getBackupPath(filename: string): string | null {
  if (!/^snapshot-[A-Za-z0-9_.-]+\.json$/.test(filename)) return null;
  if (path.basename(filename) !== filename) return null;

  const backupRoot = path.resolve(BACKUP_DIR);
  const resolved = path.resolve(backupRoot, filename);
  return resolved.startsWith(`${backupRoot}${path.sep}`) ? resolved : null;
}

async function ensureDir() {
  await fs.mkdir(BACKUP_DIR, { recursive: true });
}

async function listBackupFiles(): Promise<string[]> {
  try {
    const files = await fs.readdir(BACKUP_DIR);
    return files
      .filter((f) => f.startsWith('snapshot-') && f.endsWith('.json'))
      .sort()
      .reverse(); // newest first
  } catch {
    return [];
  }
}

// POST: 새 스냅샷 저장 + 오래된 파일 정리
export async function POST(request: NextRequest) {
  if (!isLocalBackupEnabled()) return apiError('backup_disabled');
  if (!checkCsrf(request).ok) return apiError('csrf_rejected');
  if (Number(request.headers.get('content-length') ?? '0') > MAX_BACKUP_BYTES) {
    return apiError('payload_too_large');
  }

  try {
    const data = await request.json();
    await ensureDir();

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `snapshot-${timestamp}.json`;
    const filepath = path.join(BACKUP_DIR, filename);

    await fs.writeFile(filepath, JSON.stringify(data, null, 2), 'utf-8');

    // 오래된 백업 정리
    const files = await listBackupFiles();
    if (files.length > MAX_BACKUPS) {
      const toDelete = files.slice(MAX_BACKUPS);
      await Promise.all(
        toDelete.map((f) => fs.unlink(path.join(BACKUP_DIR, f)).catch(() => {}))
      );
    }

    return NextResponse.json({ ok: true, filename });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 }
    );
  }
}

// GET: 백업 목록 또는 특정 백업 내용 조회
export async function GET(request: NextRequest) {
  if (!isLocalBackupEnabled()) return apiError('backup_disabled');

  try {
    const filename = request.nextUrl.searchParams.get('file');

    if (filename) {
      // 특정 파일 내용 반환
      const filepath = getBackupPath(filename);
      if (!filepath) {
        return NextResponse.json({ ok: false, error: 'invalid filename' }, { status: 400 });
      }
      const content = await fs.readFile(filepath, 'utf-8');
      return NextResponse.json({ ok: true, data: JSON.parse(content) });
    }

    // 목록 반환
    await ensureDir();
    const files = await listBackupFiles();
    const list = await Promise.all(
      files.map(async (f) => {
        const stat = await fs.stat(path.join(BACKUP_DIR, f));
        return {
          filename: f,
          createdAt: stat.mtime.toISOString(),
          size: stat.size,
        };
      })
    );
    return NextResponse.json({ ok: true, backups: list });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 }
    );
  }
}
