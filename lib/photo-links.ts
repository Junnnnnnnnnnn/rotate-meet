// Stable, server-side-signed redirect URLs for private R2 photos. The
// Telegram operator notification embeds these instead of raw presigned URLs
// so the link stays valid for the lifetime of the photo — the redirect
// endpoint mints a fresh presigned URL on every click.
import { createHmac, timingSafeEqual } from 'crypto';

const appBaseUrl = process.env.APP_BASE_URL;
const linkSecret = process.env.PHOTO_LINK_SECRET;

if (!appBaseUrl) throw new Error('APP_BASE_URL is not set');
if (!linkSecret) throw new Error('PHOTO_LINK_SECRET is not set');

export type PhotoKind = 'id' | 'employment';

export const PHOTO_KINDS: readonly PhotoKind[] = ['id', 'employment'];

export function isPhotoKind(v: string): v is PhotoKind {
  return (PHOTO_KINDS as readonly string[]).includes(v);
}

function sign(signupId: string, kind: PhotoKind): string {
  return createHmac('sha256', linkSecret!)
    .update(`${signupId}:${kind}`)
    .digest('hex');
}

export function buildPhotoUrl(signupId: string, kind: PhotoKind): string {
  const base = appBaseUrl!.replace(/\/+$/, '');
  return `${base}/api/photo/${signupId}/${kind}?sig=${sign(signupId, kind)}`;
}

export function verifyPhotoSig(
  signupId: string,
  kind: PhotoKind,
  sig: string,
): boolean {
  if (!/^[0-9a-f]+$/i.test(sig)) return false;
  const expected = Buffer.from(sign(signupId, kind), 'hex');
  let provided: Buffer;
  try {
    provided = Buffer.from(sig, 'hex');
  } catch {
    return false;
  }
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(provided, expected);
}
