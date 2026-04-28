import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

const BACKUP_DIR = path.join(process.cwd(), '.local-backup');
const MAX_BACKUPS = 20;

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
  try {
    const filename = request.nextUrl.searchParams.get('file');

    if (filename) {
      // 특정 파일 내용 반환
      if (!filename.startsWith('snapshot-') || !filename.endsWith('.json')) {
        return NextResponse.json({ ok: false, error: 'invalid filename' }, { status: 400 });
      }
      const filepath = path.join(BACKUP_DIR, filename);
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
