import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getPrivatePresignedUrl } from '@/lib/r2';
import { isPhotoKind, verifyPhotoSig, type PhotoKind } from '@/lib/photo-links';

export const dynamic = 'force-dynamic';

// Short — only needs to outlive the redirect itself. The operator follows the
// 302 immediately; the image loads in their browser within seconds. R2 won't
// re-check expiry after the GET starts.
const REDIRECT_PRESIGNED_TTL_SECONDS = 60;

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function htmlGone(body: string): NextResponse {
  return new NextResponse(
    `<!doctype html><meta charset="utf-8"><title>410 Gone</title><body style="font-family:system-ui;padding:40px;color:#333">${body}</body>`,
    { status: 410, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  );
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ signupId: string; kind: string }> },
) {
  const { signupId, kind } = await params;
  const sig = request.nextUrl.searchParams.get('sig') ?? '';

  if (!UUID_REGEX.test(signupId)) {
    return NextResponse.json({ error: 'bad signup id' }, { status: 400 });
  }
  if (!isPhotoKind(kind)) {
    return NextResponse.json({ error: 'bad kind' }, { status: 400 });
  }
  if (!verifyPhotoSig(signupId, kind, sig)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const column: 'photo_id_key' | 'photo_employment_key' =
    kind === 'id' ? 'photo_id_key' : 'photo_employment_key';

  const { data, error } = await supabaseAdmin
    .from('signups')
    .select(`${column}, photos_purged_at, photo_id_deleted_at`)
    .eq('id', signupId)
    .maybeSingle();
  if (error) {
    return NextResponse.json(
      { error: `lookup failed: ${error.message}` },
      { status: 500 },
    );
  }
  if (!data) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  const row = data as Record<string, unknown>;
  const objectKey = row[column] as string | null;
  if (!objectKey) {
    const purged = row.photos_purged_at as string | null;
    const idDeleted = row.photo_id_deleted_at as string | null;
    const label = labelFor(kind);
    if (purged) {
      return htmlGone(
        `<h1>410 Gone</h1><p>${label} 사진이 폐기되었습니다 (모든 사진 일괄 폐기).</p>`,
      );
    }
    if (kind === 'id' && idDeleted) {
      return htmlGone(`<h1>410 Gone</h1><p>신분증 사진이 폐기되었습니다.</p>`);
    }
    return htmlGone(`<h1>410 Gone</h1><p>${label} 사진이 폐기되었습니다.</p>`);
  }

  const presignedUrl = await getPrivatePresignedUrl(
    objectKey,
    REDIRECT_PRESIGNED_TTL_SECONDS,
  );

  return NextResponse.redirect(presignedUrl, {
    status: 302,
    headers: {
      // Prevent the redirect itself from being cached so a later click still
      // hits the route handler and mints a fresh presigned URL.
      'Cache-Control': 'private, no-store, max-age=0',
    },
  });
}

function labelFor(kind: PhotoKind): string {
  return kind === 'id' ? '신분증' : '직업 인증';
}
