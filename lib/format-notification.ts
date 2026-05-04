import {
  escapeHtml,
  type InlineKeyboardButton,
  type InlineKeyboardMarkup,
} from './telegram';

const PARTICIPATION_LABEL: Record<string, string> = {
  new: '신규',
  repeat: '재참가',
};

export type SignupRecord = {
  id: string;
  name: string;
  phone: string;
  birthdate: string;
  participation: string;
  height_cm: number;
  weight_kg: number;
  mbti: string;
  job: string;
  ideal_tags: string[];
  ideal_type_note: string | null;
  strengths: string | null;
  prefer_age: string;
  drink: string;
  channel: string;
  insta: string | null;
  companion: string | null;
  status: string;
  verified_at: string | null;
  verified_by_name: string | null;
  paid_at: string | null;
  paid_by_name: string | null;
  photo_face_url: string;
  photo_body_url: string;
  photo_id_key: string | null;
  photo_id_deleted_at: string | null;
  photo_id_deleted_by: string | null;
  admin_memos: AdminMemo[];
};

export type AdminMemo = {
  text: string;
  author_id: number;
  author_name: string;
  created_at: string;
};

export function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  const m = kst.getUTCMonth() + 1;
  const day = kst.getUTCDate();
  const h = kst.getUTCHours().toString().padStart(2, '0');
  const min = kst.getUTCMinutes().toString().padStart(2, '0');
  return `${m}/${day} ${h}:${min}`;
}

export function formatNotification(
  s: SignupRecord,
  idPresignedUrl: string | null,
): string {
  const lines: string[] = [];
  lines.push('🌹 <b>신규 참가 신청</b>');
  lines.push(`ID: <code>${escapeHtml(s.id.slice(0, 8))}</code>`);

  if (s.status === 'paid' && s.paid_at) {
    const by = s.paid_by_name ? ` (by ${escapeHtml(s.paid_by_name)})` : '';
    lines.push(`<b>상태:</b> 💰 입금 완료${by} · ${formatTimestamp(s.paid_at)}`);
  } else if (s.status === 'normal' && s.verified_at) {
    const by = s.verified_by_name ? ` (by ${escapeHtml(s.verified_by_name)})` : '';
    lines.push(`<b>상태:</b> ✓ 본인확인 (입금 대기)${by} · ${formatTimestamp(s.verified_at)}`);
  } else {
    lines.push('<b>상태:</b> 🟡 대기 중');
  }

  lines.push('');
  lines.push(
    `<b>이름:</b> ${escapeHtml(s.name)} (${PARTICIPATION_LABEL[s.participation] ?? s.participation})`,
  );
  lines.push(`<b>연락처:</b> ${escapeHtml(s.phone)}`);
  lines.push(`<b>생년월일:</b> ${escapeHtml(s.birthdate)}`);
  lines.push(`<b>키/몸무게:</b> ${s.height_cm}cm / ${s.weight_kg}kg`);
  lines.push(`<b>MBTI:</b> ${escapeHtml(s.mbti)}`);
  lines.push(`<b>직업:</b> ${escapeHtml(s.job)}`);

  if (s.ideal_tags.length > 0 || s.ideal_type_note) {
    lines.push('');
    lines.push('<b>이상형:</b>');
    if (s.ideal_tags.length) lines.push(escapeHtml(s.ideal_tags.join(', ')));
    if (s.ideal_type_note) lines.push(`└ ${escapeHtml(s.ideal_type_note)}`);
  }

  lines.push('');
  lines.push(`<b>선호 나이대:</b> ${escapeHtml(s.prefer_age)}`);
  lines.push(`<b>음료:</b> ${escapeHtml(s.drink)}`);
  lines.push(`<b>경로:</b> ${escapeHtml(s.channel)}`);
  if (s.insta) lines.push(`<b>인스타:</b> ${escapeHtml(s.insta)}`);
  if (s.companion) lines.push(`<b>동반:</b> ${escapeHtml(s.companion)}`);
  if (s.strengths) {
    lines.push('');
    lines.push('<b>장점:</b>');
    lines.push(escapeHtml(s.strengths));
  }

  lines.push('');
  if (s.photo_id_key && idPresignedUrl) {
    lines.push(`🪪 <a href="${idPresignedUrl}">신분증 보기 (4시간 유효)</a>`);
  } else if (s.photo_id_deleted_at) {
    const by = s.photo_id_deleted_by ? ` (by ${escapeHtml(s.photo_id_deleted_by)})` : '';
    lines.push(`🗑 신분증 폐기됨${by} · ${formatTimestamp(s.photo_id_deleted_at)}`);
  }

  if (s.admin_memos.length > 0) {
    lines.push('');
    lines.push(`📝 <b>메모 (${s.admin_memos.length}건)</b>`);
    for (const m of s.admin_memos) {
      lines.push(
        `└ <i>${escapeHtml(m.author_name)}</i> (${formatTimestamp(m.created_at)}): ${escapeHtml(m.text)}`,
      );
    }
  }

  return lines.join('\n');
}

export function buildButtons(signup: SignupRecord): InlineKeyboardMarkup {
  const buttons: InlineKeyboardButton[][] = [];

  const row1: InlineKeyboardButton[] = [];
  if (signup.status === 'pending') {
    row1.push({ text: '✓ 확인', callback_data: `verify:${signup.id}` });
  } else if (signup.status === 'normal') {
    row1.push({ text: '💰 입금완료', callback_data: `paid:${signup.id}` });
  }
  row1.push({ text: '✗ 거절', callback_data: `reject:${signup.id}` });
  buttons.push(row1);

  const row2: InlineKeyboardButton[] = [];
  if (signup.photo_id_key) {
    row2.push({
      text: '🗑 신분증 폐기',
      callback_data: `delete_id:${signup.id}`,
    });
  }
  row2.push({ text: '💬 메모', callback_data: `memo:${signup.id}` });
  buttons.push(row2);

  return { inline_keyboard: buttons };
}

export function r2KeyFromUrl(url: string, baseUrl: string): string {
  const prefix = baseUrl.endsWith('/') ? baseUrl : baseUrl + '/';
  return url.startsWith(prefix) ? url.slice(prefix.length) : url;
}
