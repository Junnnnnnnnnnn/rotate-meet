import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import {
  uploadPublic,
  uploadPrivate,
  deletePublic,
  deletePrivate,
  getPrivatePresignedUrl,
} from '@/lib/r2';
import { sendMessage, sendPhoto, TELEGRAM_CHAT_ID } from '@/lib/telegram';
import {
  formatNotification,
  buildButtons,
  type SignupRecord,
} from '@/lib/format-notification';

const MAX_PHOTO_SIZE = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);

const PARTICIPATIONS = ['new', 'repeat'] as const;
const PREFER_AGES = ['동갑', '연상', '연하', '상관없음'] as const;
const DRINKS = ['아메리카노', '라떼', '아이스티', '탄산수'] as const;
const CHANNELS = ['인스타그램', '친구 추천', '검색', '기타'] as const;

const ID_PRESIGNED_TTL_SECONDS = 4 * 60 * 60;

class ValidationError extends Error {
  code?: string;
  constructor(msg: string, code?: string) {
    super(msg);
    this.code = code;
  }
}

function isOneOf<T extends readonly string[]>(
  v: unknown,
  options: T,
): v is T[number] {
  return typeof v === 'string' && (options as readonly string[]).includes(v);
}

function getStr(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === 'string' ? v : '';
}

function extFromMime(mime: string): string {
  if (mime === 'image/jpeg') return 'jpg';
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  if (mime === 'image/heic') return 'heic';
  if (mime === 'image/heif') return 'heif';
  return 'bin';
}

function validatePhoto(file: unknown, label: string): File {
  if (!(file instanceof File)) {
    throw new ValidationError(`${label} 사진이 누락되었어요`);
  }
  if (file.size > MAX_PHOTO_SIZE) {
    throw new ValidationError(`${label} 사진은 5MB 이하여야 해요`);
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    throw new ValidationError(`${label} 사진 형식이 지원되지 않아요`);
  }
  return file;
}

export async function POST(request: NextRequest) {
  try {
    const fd = await request.formData();

    const name = getStr(fd, 'name').trim();
    const phone = getStr(fd, 'phone').trim();
    const birthdate = getStr(fd, 'birthdate').trim();
    const participation = getStr(fd, 'participation');
    const heightStr = getStr(fd, 'height');
    const weightStr = getStr(fd, 'weight');
    const mbti = getStr(fd, 'mbti').trim().toUpperCase();
    const job = getStr(fd, 'job').trim();
    const idealTagsStr = getStr(fd, 'ideal_tags');
    const idealTypeNote = getStr(fd, 'ideal_type_note').trim();
    const strengths = getStr(fd, 'strengths').trim();
    const preferAge = getStr(fd, 'prefer_age');
    const drink = getStr(fd, 'drink');
    const channel = getStr(fd, 'channel');
    const insta = getStr(fd, 'insta').trim();
    const companion = getStr(fd, 'companion').trim();
    const refundAgreed = getStr(fd, 'refund_agreed') === 'true';
    const heroVariant = getStr(fd, 'hero_variant');

    if (!name) throw new ValidationError('이름이 누락되었어요');
    if (!/^01[016789]-\d{3,4}-\d{4}$/.test(phone))
      throw new ValidationError('연락처 형식이 올바르지 않아요');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(birthdate))
      throw new ValidationError('생년월일 형식이 올바르지 않아요');
    if (!isOneOf(participation, PARTICIPATIONS))
      throw new ValidationError('참가 이력 값이 잘못됐어요');

    const heightCm = parseInt(heightStr, 10);
    const weightKg = parseInt(weightStr, 10);
    if (!Number.isFinite(heightCm) || heightCm < 140 || heightCm > 210)
      throw new ValidationError('키 값이 범위를 벗어났어요');
    if (!Number.isFinite(weightKg) || weightKg < 35 || weightKg > 130)
      throw new ValidationError('몸무게 값이 범위를 벗어났어요');
    if (!/^[EI][NS][TF][JP]$/.test(mbti))
      throw new ValidationError('MBTI 값이 잘못됐어요');
    if (!job) throw new ValidationError('직업이 누락되었어요');
    if (!isOneOf(preferAge, PREFER_AGES))
      throw new ValidationError('선호 나이대 값이 잘못됐어요');
    if (!isOneOf(drink, DRINKS))
      throw new ValidationError('음료 값이 잘못됐어요');
    if (!isOneOf(channel, CHANNELS))
      throw new ValidationError('경로 값이 잘못됐어요');
    if (!refundAgreed)
      throw new ValidationError('환불 규정 동의가 필요해요');

    let idealTags: string[] = [];
    try {
      const parsed: unknown = JSON.parse(idealTagsStr || '[]');
      if (Array.isArray(parsed)) {
        idealTags = parsed
          .filter((x): x is string => typeof x === 'string')
          .slice(0, 5);
      }
    } catch {
      idealTags = [];
    }

    const photoFace = validatePhoto(fd.get('photoFace'), '얼굴');
    const photoBody = validatePhoto(fd.get('photoBody'), '전신');
    const photoId = validatePhoto(fd.get('photoId'), '신분증');

    const id = randomUUID();
    const faceKey = `face/${id}.${extFromMime(photoFace.type)}`;
    const bodyKey = `body/${id}.${extFromMime(photoBody.type)}`;
    const idKey = `id/${id}.${extFromMime(photoId.type)}`;

    const [faceUrl, bodyUrl, idObjectKey] = await Promise.all([
      uploadPublic(
        faceKey,
        Buffer.from(await photoFace.arrayBuffer()),
        photoFace.type,
      ),
      uploadPublic(
        bodyKey,
        Buffer.from(await photoBody.arrayBuffer()),
        photoBody.type,
      ),
      uploadPrivate(
        idKey,
        Buffer.from(await photoId.arrayBuffer()),
        photoId.type,
      ),
    ]);

    const userAgent = request.headers.get('user-agent') ?? null;
    const referrer = request.headers.get('referer') ?? null;
    const metadata: Record<string, unknown> = {};
    if (heroVariant) metadata.hero_variant = heroVariant;
    if (userAgent) metadata.user_agent = userAgent;
    if (referrer) metadata.referrer = referrer;

    const { data: signup, error: dbError } = await supabaseAdmin
      .from('signups')
      .insert({
        id,
        name,
        phone,
        birthdate,
        participation,
        height_cm: heightCm,
        weight_kg: weightKg,
        mbti,
        photo_face_url: faceUrl,
        photo_body_url: bodyUrl,
        photo_id_key: idObjectKey,
        job,
        ideal_tags: idealTags,
        ideal_type_note: idealTypeNote || null,
        strengths: strengths || null,
        prefer_age: preferAge,
        drink,
        channel,
        insta: insta || null,
        companion: companion || null,
        refund_agreed: refundAgreed,
        metadata,
      })
      .select()
      .single();

    if (dbError || !signup) {
      await Promise.allSettled([
        deletePublic(faceKey),
        deletePublic(bodyKey),
        deletePrivate(idKey),
      ]);
      if (dbError?.code === '23505' && dbError.message.includes('signups_phone_active_uidx')) {
        throw new ValidationError(
          '이미 신청된 연락처예요. 같은 번호로는 한 번만 신청할 수 있어요.',
          'duplicate_phone',
        );
      }
      throw new Error(`DB insert failed: ${dbError?.message ?? 'unknown'}`);
    }

    try {
      const facePhotoMsg = await sendPhoto(faceUrl);
      const bodyPhotoMsg = await sendPhoto(bodyUrl);
      const idPresignedUrl = await getPrivatePresignedUrl(
        idObjectKey,
        ID_PRESIGNED_TTL_SECONDS,
      );

      const record = signup as SignupRecord;
      const text = formatNotification(record, idPresignedUrl);

      const notifyMsg = await sendMessage(text, {
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        reply_markup: buildButtons(record),
      });

      await supabaseAdmin
        .from('signups')
        .update({
          telegram_chat_id: parseInt(TELEGRAM_CHAT_ID, 10),
          telegram_notify_msg_id: notifyMsg.message_id,
          telegram_photo_msg_ids: [
            facePhotoMsg.message_id,
            bodyPhotoMsg.message_id,
          ],
        })
        .eq('id', id);
    } catch (tgErr) {
      console.error('Telegram notification failed:', tgErr);
    }

    return NextResponse.json({ ok: true, id });
  } catch (err) {
    if (err instanceof ValidationError) {
      return NextResponse.json(
        { ok: false, error: err.message, code: err.code },
        { status: 400 },
      );
    }
    console.error('Submit error:', err);
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : '서버 오류가 발생했어요',
      },
      { status: 500 },
    );
  }
}
