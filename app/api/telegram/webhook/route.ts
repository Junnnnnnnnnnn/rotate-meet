import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import {
  deletePublic,
  deletePrivate,
  getPrivatePresignedUrl,
} from '@/lib/r2';
import {
  sendMessage,
  editMessageText,
  deleteMessage,
  answerCallbackQuery,
  escapeHtml,
  TELEGRAM_CHAT_ID,
  type InlineKeyboardButton,
  type InlineKeyboardMarkup,
} from '@/lib/telegram';
import {
  formatNotification,
  buildButtons,
  formatTimestamp,
  r2KeyFromUrl,
  type SignupRecord,
  type AdminMemo,
} from '@/lib/format-notification';
import {
  isValidDateStr,
  parseTimeLabel,
  genSlug,
  dateParen,
  type EventSession,
} from '@/lib/sessions';

const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
const publicBaseUrl = process.env.R2_PUBLIC_BASE_URL;
if (!webhookSecret) throw new Error('TELEGRAM_WEBHOOK_SECRET is not set');
if (!publicBaseUrl) throw new Error('R2_PUBLIC_BASE_URL is not set');

const PRIVATE_PRESIGNED_TTL_SECONDS = 4 * 60 * 60;
const OPERATOR_CHAT_ID = parseInt(TELEGRAM_CHAT_ID, 10);
const UUID_REGEX = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/;

type TelegramUser = {
  id: number;
  is_bot?: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
};

type TelegramChat = {
  id: number;
  type: string;
};

type TelegramMessage = {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  text?: string;
  reply_to_message?: TelegramMessage;
};

type TelegramCallbackQuery = {
  id: string;
  from: TelegramUser;
  message?: TelegramMessage;
  data?: string;
};

type TelegramUpdate = {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
};

function formatUserName(u: TelegramUser): string {
  return u.last_name ? `${u.first_name} ${u.last_name}` : u.first_name;
}

function getMessageUrl(messageId: number): string | null {
  if (OPERATOR_CHAT_ID >= -1_000_000_000_000) return null;
  const shortId = Math.abs(OPERATOR_CHAT_ID) - 1_000_000_000_000;
  return `https://t.me/c/${shortId}/${messageId}`;
}

function getCommand(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith('/')) return null;
  const first = trimmed.split(/\s+/)[0];
  return first.split('@')[0];
}

export async function POST(request: NextRequest) {
  const providedSecret = request.headers.get('x-telegram-bot-api-secret-token');
  if (providedSecret !== webhookSecret) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const update = (await request.json()) as TelegramUpdate;

  try {
    if (update.callback_query) {
      await handleCallback(update.callback_query);
    } else if (update.message) {
      await handleMessage(update.message);
    }
  } catch (err) {
    console.error('Webhook handler error:', err);
  }

  return NextResponse.json({ ok: true });
}

async function handleCallback(cb: TelegramCallbackQuery): Promise<void> {
  if (!cb.data || !cb.message) {
    await answerCallbackQuery(cb.id);
    return;
  }
  if (cb.message.chat.id !== OPERATOR_CHAT_ID) {
    await answerCallbackQuery(cb.id);
    return;
  }

  const [action, signupId] = cb.data.split(':');
  if (!action || !signupId) {
    await answerCallbackQuery(cb.id);
    return;
  }

  const operator = cb.from;
  const operatorName = formatUserName(operator);
  const notifyMsgId = cb.message.message_id;

  try {
    if (action === 'verify') {
      await actionVerify(signupId, notifyMsgId, operator.id, operatorName);
      await answerCallbackQuery(cb.id, '✓ 본인확인 완료');
    } else if (action === 'paid') {
      await actionPaid(signupId, notifyMsgId, operator.id, operatorName);
      await answerCallbackQuery(cb.id, '💰 입금 완료 처리됨');
    } else if (action === 'reject') {
      await actionReject(signupId, notifyMsgId, operator.id, operatorName);
      await answerCallbackQuery(cb.id, '✗ 거절 — 차단 처리됨');
    } else if (action === 'delete_id') {
      await actionDeleteId(signupId, notifyMsgId, operator.id, operatorName);
      await answerCallbackQuery(cb.id, '🗑 신분증 폐기 완료');
    } else if (action === 'purge') {
      await actionPurgeAllPhotos(signupId, notifyMsgId, operator.id, operatorName);
      await answerCallbackQuery(cb.id, '🗑 모든 사진 폐기 완료');
    } else if (action === 'memo') {
      await actionMemoPrompt(signupId, operatorName);
      await answerCallbackQuery(cb.id, '메모를 입력해주세요');
    } else if (action === 'datedel') {
      await dateActionDelete(signupId, cb);
    } else if (action === 'datedelc') {
      await dateActionDeleteConfirm(signupId, cb);
    } else if (action === 'datedelx') {
      await dateActionDeleteCancel(cb);
    } else if (action === 'dateact') {
      await dateActionActivate(signupId, cb);
    } else {
      await answerCallbackQuery(cb.id);
    }
  } catch (err) {
    console.error(`Action ${action} failed:`, err);
    const errMsg = err instanceof Error ? err.message : '처리 중 오류가 발생했어요';
    await answerCallbackQuery(cb.id, errMsg.slice(0, 200), true);
  }
}

async function handleMessage(msg: TelegramMessage): Promise<void> {
  if (msg.chat.id !== OPERATOR_CHAT_ID) return;
  if (msg.from?.is_bot) return;
  const text = msg.text?.trim();
  if (!text) return;

  if (msg.reply_to_message?.text && msg.from) {
    const refMatch = msg.reply_to_message.text.match(/ref:([0-9a-f-]{36})/);
    if (refMatch) {
      const signupId = refMatch[1];
      try {
        await appendMemo(signupId, text, msg.from);
      } catch (err) {
        console.error('Append memo failed:', err);
      }
      try {
        await deleteMessage(msg.reply_to_message.message_id);
        await deleteMessage(msg.message_id);
      } catch (e) {
        console.error('Cleanup messages failed:', e);
      }
      return;
    }
  }

  const cmd = getCommand(text);
  if (cmd === '/status' || text === '현황') {
    await sendStatus();
    return;
  }
  if (cmd === '/list' || text === '목록') {
    await sendList();
    return;
  }
  if (cmd === '/paid' && msg.from) {
    const args = text.replace(/^\/paid(@\S+)?\s*/, '').trim();
    await handlePaidCommand(args, msg.from);
    return;
  }
  if (cmd === '/date') {
    const args = text.replace(/^\/date(@\S+)?\s*/, '').trim();
    await handleDateCommand(args);
    return;
  }
  if (cmd === '/help' || cmd === '/start' || text === '도움말') {
    await sendHelp();
    return;
  }
}

async function actionVerify(
  signupId: string,
  notifyMsgId: number,
  operatorId: number,
  operatorName: string,
): Promise<void> {
  const { data, error } = await supabaseAdmin
    .from('signups')
    .update({
      status: 'normal',
      verified_at: new Date().toISOString(),
      verified_by_id: operatorId,
      verified_by_name: operatorName,
    })
    .eq('id', signupId)
    .select()
    .single();
  if (error || !data) throw new Error(`Verify failed: ${error?.message}`);
  await refreshNotifyMessage(data as SignupRecord, notifyMsgId);
}

async function actionPaid(
  signupId: string,
  notifyMsgId: number,
  operatorId: number,
  operatorName: string,
): Promise<void> {
  const { data: current, error: fetchErr } = await supabaseAdmin
    .from('signups')
    .select('status')
    .eq('id', signupId)
    .single();
  if (fetchErr || !current) throw new Error('신청서를 찾을 수 없어요');
  if (current.status !== 'normal') {
    throw new Error('본인확인을 먼저 해주세요');
  }

  const { data, error } = await supabaseAdmin
    .from('signups')
    .update({
      status: 'paid',
      paid_at: new Date().toISOString(),
      paid_by_id: operatorId,
      paid_by_name: operatorName,
    })
    .eq('id', signupId)
    .select()
    .single();
  if (error || !data) throw new Error(`입금 처리 실패: ${error?.message}`);
  await refreshNotifyMessage(data as SignupRecord, notifyMsgId);
}

// Stored key is authoritative, but fall back to the deterministic key the
// submit route always writes: the client compresses every photo to JPEG, so
// id/employment objects are always `${prefix}/${signupId}.jpg`. This rescues
// rows whose key column ended up null (older rows, or a previously swallowed
// failure that nulled the key without deleting the object).
function privateKeyFor(
  stored: string | null,
  prefix: 'id' | 'employment',
  signupId: string,
): string {
  return stored && stored.trim() ? stored : `${prefix}/${signupId}.jpg`;
}

// Deletes all R2 photos for a signup. Public face/body are best-effort. The
// private id/employment deletes are authoritative: R2 DeleteObject is
// idempotent (no error if already gone), so a throw here is a real failure
// (auth/network/config) — we let it propagate so the caller does NOT null the
// DB keys or mark photos_purged. The row stays accurate and the operator gets
// a visible error to retry, instead of silently orphaning the object.
async function purgeSignupPhotos(s: SignupRecord): Promise<void> {
  const faceKey = r2KeyFromUrl(s.photo_face_url, publicBaseUrl!);
  const bodyKey = r2KeyFromUrl(s.photo_body_url, publicBaseUrl!);
  await Promise.allSettled([deletePublic(faceKey), deletePublic(bodyKey)]);

  await Promise.all([
    deletePrivate(privateKeyFor(s.photo_id_key, 'id', s.id)),
    deletePrivate(privateKeyFor(s.photo_employment_key, 'employment', s.id)),
  ]);
}

async function actionReject(
  signupId: string,
  notifyMsgId: number,
  operatorId: number,
  operatorName: string,
): Promise<void> {
  const { data: signup, error: fetchErr } = await supabaseAdmin
    .from('signups')
    .select('*')
    .eq('id', signupId)
    .single();
  if (fetchErr || !signup) throw new Error(`Signup not found`);

  const s = signup as SignupRecord;

  await purgeSignupPhotos(s);

  const now = new Date().toISOString();
  const { data: updated, error: updErr } = await supabaseAdmin
    .from('signups')
    .update({
      status: 'blocked',
      blocked_at: now,
      blocked_by_id: operatorId,
      blocked_by: operatorName,
      photo_id_key: null,
      photo_employment_key: null,
      photos_purged_at: now,
      photos_purged_by_id: operatorId,
      photos_purged_by: operatorName,
    })
    .eq('id', signupId)
    .select()
    .single();
  if (updErr || !updated) throw new Error(`DB update failed: ${updErr?.message}`);

  await refreshNotifyMessage(updated as SignupRecord, notifyMsgId);
}

async function actionPurgeAllPhotos(
  signupId: string,
  notifyMsgId: number,
  operatorId: number,
  operatorName: string,
): Promise<void> {
  const { data: signup, error: fetchErr } = await supabaseAdmin
    .from('signups')
    .select('*')
    .eq('id', signupId)
    .single();
  if (fetchErr || !signup) throw new Error(`Signup not found`);

  const s = signup as SignupRecord;

  await purgeSignupPhotos(s);

  const now = new Date().toISOString();
  const { data: updated, error: updErr } = await supabaseAdmin
    .from('signups')
    .update({
      photo_id_key: null,
      photo_employment_key: null,
      photos_purged_at: now,
      photos_purged_by_id: operatorId,
      photos_purged_by: operatorName,
    })
    .eq('id', signupId)
    .select()
    .single();
  if (updErr || !updated) throw new Error(`DB update failed: ${updErr?.message}`);

  await refreshNotifyMessage(updated as SignupRecord, notifyMsgId);
}

async function actionDeleteId(
  signupId: string,
  notifyMsgId: number,
  operatorId: number,
  operatorName: string,
): Promise<void> {
  const { data: signup, error: fetchErr } = await supabaseAdmin
    .from('signups')
    .select('*')
    .eq('id', signupId)
    .single();
  if (fetchErr || !signup) throw new Error('Signup not found');

  const s = signup as SignupRecord;
  if (s.photo_id_key) {
    await deletePrivate(s.photo_id_key);
  }

  const { data: updated, error: updErr } = await supabaseAdmin
    .from('signups')
    .update({
      photo_id_key: null,
      photo_id_deleted_at: new Date().toISOString(),
      photo_id_deleted_by_id: operatorId,
      photo_id_deleted_by: operatorName,
    })
    .eq('id', signupId)
    .select()
    .single();
  if (updErr || !updated) throw new Error('DB update failed');

  await refreshNotifyMessage(updated as SignupRecord, notifyMsgId);
}

async function actionMemoPrompt(
  signupId: string,
  operatorName: string,
): Promise<void> {
  if (!UUID_REGEX.test(signupId)) throw new Error('Invalid signup id');

  const { data: signup, error } = await supabaseAdmin
    .from('signups')
    .select('name')
    .eq('id', signupId)
    .single();
  if (error || !signup) throw new Error('Signup not found');

  const text = [
    '📝 <b>메모 입력</b>',
    `신청서: ${escapeHtml(signup.name as string)}`,
    '',
    `${escapeHtml(operatorName)}님, 이 메시지에 답장(reply)으로 메모를 입력해주세요.`,
    '',
    `<code>ref:${signupId}</code>`,
  ].join('\n');

  await sendMessage(text, {
    parse_mode: 'HTML',
    disable_notification: true,
    reply_markup: {
      force_reply: true,
      input_field_placeholder: '메모 내용...',
    },
  });
}

async function appendMemo(
  signupId: string,
  memoText: string,
  author: TelegramUser,
): Promise<void> {
  const { data: signup, error: fetchErr } = await supabaseAdmin
    .from('signups')
    .select('*')
    .eq('id', signupId)
    .single();
  if (fetchErr || !signup) throw new Error('Signup not found');

  const s = signup as SignupRecord & { telegram_notify_msg_id: number | null };
  const newMemo: AdminMemo = {
    text: memoText,
    author_id: author.id,
    author_name: formatUserName(author),
    created_at: new Date().toISOString(),
  };
  const updatedMemos = [...s.admin_memos, newMemo];

  const { data: updated, error: updErr } = await supabaseAdmin
    .from('signups')
    .update({ admin_memos: updatedMemos })
    .eq('id', signupId)
    .select()
    .single();
  if (updErr || !updated) throw new Error('DB update failed');

  const u = updated as SignupRecord & { telegram_notify_msg_id: number | null };
  if (u.telegram_notify_msg_id) {
    await refreshNotifyMessage(u, u.telegram_notify_msg_id);
  }
}

async function refreshNotifyMessage(
  signup: SignupRecord,
  notifyMsgId: number,
): Promise<void> {
  let idUrl: string | null = null;
  if (signup.photo_id_key) {
    idUrl = await getPrivatePresignedUrl(
      signup.photo_id_key,
      PRIVATE_PRESIGNED_TTL_SECONDS,
    );
  }
  let employmentUrl: string | null = null;
  if (signup.photo_employment_key) {
    employmentUrl = await getPrivatePresignedUrl(
      signup.photo_employment_key,
      PRIVATE_PRESIGNED_TTL_SECONDS,
    );
  }
  const text = formatNotification(signup, idUrl, employmentUrl);
  await editMessageText(notifyMsgId, text, {
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    reply_markup: buildButtons(signup),
  });
}

async function sendStatus(): Promise<void> {
  const { data, error } = await supabaseAdmin
    .from('signups')
    .select('status');
  if (error) {
    await sendMessage(`현황 조회 실패: ${error.message}`);
    return;
  }
  const rows = data ?? [];

  let pending = 0;
  let normal = 0;
  let paid = 0;
  let cancelled = 0;
  let blocked = 0;
  for (const row of rows) {
    if (row.status === 'pending') pending++;
    else if (row.status === 'normal') normal++;
    else if (row.status === 'paid') paid++;
    else if (row.status === 'cancelled') cancelled++;
    else if (row.status === 'blocked') blocked++;
  }

  const lines = [
    '📊 <b>신청 현황</b>',
    '',
    `총 ${rows.length}건`,
    `🟡 본인확인 대기: ${pending}건`,
    `✓ 입금 대기: ${normal}건`,
    `💰 입금 완료: ${paid}건`,
  ];
  if (cancelled > 0) lines.push(`✗ 취소: ${cancelled}건`);
  if (blocked > 0) lines.push(`❌ 거절(차단): ${blocked}건`);
  await sendMessage(lines.join('\n'), { parse_mode: 'HTML', disable_notification: true });
}

type ListRow = {
  id: string;
  name: string;
  phone: string;
  status: string;
  created_at: string;
  telegram_notify_msg_id: number | null;
};

async function sendList(): Promise<void> {
  const { data, error } = await supabaseAdmin
    .from('signups')
    .select('id, name, phone, status, created_at, telegram_notify_msg_id')
    // 취소(소프트 딜리트)·거절(차단)·실제 삭제된 신청은 목록에서 제외.
    // 실제 삭제 행은 DB에서 사라지므로 cancelled/blocked만 걸러내면 됨.
    .not('status', 'in', '(cancelled,blocked)')
    .order('created_at', { ascending: true });
  if (error) {
    await sendMessage(`목록 조회 실패: ${error.message}`);
    return;
  }
  if (!data || data.length === 0) {
    await sendMessage('아직 신청이 없어요.');
    return;
  }

  const rows = data as ListRow[];
  const pending = rows.filter((r) => r.status === 'pending');
  const normal = rows.filter((r) => r.status === 'normal');
  const paid = rows.filter((r) => r.status === 'paid');

  const lines: string[] = [];
  lines.push(`📋 <b>신청 현황 (총 ${rows.length}건)</b>`);

  let globalIdx = 0;
  const buttons: InlineKeyboardButton[][] = [];
  let buttonRow: InlineKeyboardButton[] = [];
  const addButton = (idx: number, msgId: number | null) => {
    if (!msgId) return;
    const url = getMessageUrl(msgId);
    if (!url) return;
    buttonRow.push({ text: `→ ${idx}`, url });
    if (buttonRow.length === 5) {
      buttons.push(buttonRow);
      buttonRow = [];
    }
  };

  if (pending.length > 0) {
    lines.push('');
    lines.push(`🟡 <b>본인확인 대기 (${pending.length}건)</b> — [✓ 확인] 필요`);
    pending.forEach((r) => {
      globalIdx++;
      const idShort = r.id.slice(0, 8);
      const ts = formatTimestamp(r.created_at);
      lines.push(
        `${globalIdx}. ${escapeHtml(r.name)} · ${escapeHtml(r.phone)} · <code>${idShort}</code> · ${ts}`,
      );
      addButton(globalIdx, r.telegram_notify_msg_id);
    });
  }

  if (normal.length > 0) {
    lines.push('');
    lines.push(`✓ <b>입금 대기 (${normal.length}건)</b> — 계좌 안내 후 [💰 입금완료]`);
    normal.forEach((r) => {
      globalIdx++;
      const idShort = r.id.slice(0, 8);
      const ts = formatTimestamp(r.created_at);
      lines.push(
        `${globalIdx}. ${escapeHtml(r.name)} · ${escapeHtml(r.phone)} · <code>${idShort}</code> · ${ts}`,
      );
      addButton(globalIdx, r.telegram_notify_msg_id);
    });
  }

  if (paid.length > 0) {
    lines.push('');
    lines.push(`💰 <b>입금 완료 (${paid.length}건)</b> — 참가 확정`);
    paid.forEach((r) => {
      globalIdx++;
      const ts = formatTimestamp(r.created_at);
      lines.push(`${globalIdx}. ${escapeHtml(r.name)} · ${ts}`);
      addButton(globalIdx, r.telegram_notify_msg_id);
    });
  }

  if (buttonRow.length > 0) buttons.push(buttonRow);

  let text = lines.join('\n');
  if (text.length > 4000) {
    text = text.slice(0, 4000) + '\n\n... (더 있음, 일부만 표시)';
  }
  await sendMessage(text, {
    parse_mode: 'HTML',
    disable_notification: true,
    reply_markup: buttons.length > 0 ? { inline_keyboard: buttons } : undefined,
  });
}

async function handlePaidCommand(
  args: string,
  operator: TelegramUser,
): Promise<void> {
  const prefixes = args.split(/\s+/).filter(Boolean);
  if (prefixes.length === 0) {
    await sendMessage(
      '사용법: <code>/paid abc12345 [def67890 ...]</code>\n각 신청서 8자리 ID를 입력해주세요.',
      { parse_mode: 'HTML', disable_notification: true },
    );
    return;
  }

  const { data: candidates, error: fetchErr } = await supabaseAdmin
    .from('signups')
    .select('*')
    .eq('status', 'normal');
  if (fetchErr) {
    await sendMessage(`조회 실패: ${fetchErr.message}`);
    return;
  }

  const operatorName = formatUserName(operator);
  const now = new Date().toISOString();
  const results: Array<{
    prefix: string;
    ok: boolean;
    name?: string;
    reason?: string;
  }> = [];

  for (const prefix of prefixes) {
    if (prefix.length < 4) {
      results.push({ prefix, ok: false, reason: '최소 4자리' });
      continue;
    }
    const matches = (candidates ?? []).filter((r) =>
      (r.id as string).startsWith(prefix),
    );
    if (matches.length === 0) {
      results.push({
        prefix,
        ok: false,
        reason: '본인확인된 신청서를 찾을 수 없어요',
      });
      continue;
    }
    if (matches.length > 1) {
      results.push({ prefix, ok: false, reason: '중복 매칭 — 더 긴 prefix 필요' });
      continue;
    }

    const target = matches[0] as SignupRecord & {
      telegram_notify_msg_id: number | null;
    };
    const { data: updated, error: updErr } = await supabaseAdmin
      .from('signups')
      .update({
        status: 'paid',
        paid_at: now,
        paid_by_id: operator.id,
        paid_by_name: operatorName,
      })
      .eq('id', target.id)
      .select()
      .single();
    if (updErr || !updated) {
      results.push({
        prefix,
        ok: false,
        name: target.name,
        reason: updErr?.message ?? '실패',
      });
      continue;
    }

    const u = updated as SignupRecord & {
      telegram_notify_msg_id: number | null;
    };
    if (u.telegram_notify_msg_id) {
      try {
        await refreshNotifyMessage(u, u.telegram_notify_msg_id);
      } catch (e) {
        console.error('Refresh failed:', e);
      }
    }
    results.push({ prefix, ok: true, name: u.name });
  }

  const lines = ['💰 <b>입금 처리 결과</b>', ''];
  let okCount = 0;
  for (const r of results) {
    if (r.ok) {
      lines.push(`✓ <code>${escapeHtml(r.prefix)}</code> — ${escapeHtml(r.name ?? '')}`);
      okCount++;
    } else {
      lines.push(
        `✗ <code>${escapeHtml(r.prefix)}</code> — ${escapeHtml(r.reason ?? '실패')}`,
      );
    }
  }
  lines.push('');
  lines.push(`총 ${okCount}건 처리 완료`);
  await sendMessage(lines.join('\n'), { parse_mode: 'HTML', disable_notification: true });
}

async function handleDateCommand(args: string): Promise<void> {
  if (/^add\b/i.test(args)) {
    await dateAdd(args.replace(/^add\s*/i, '').trim());
    return;
  }
  await sendDateList();
}

async function sendDateUsage(): Promise<void> {
  await sendMessage(
    [
      '사용법: <code>/date add 2025-05-24 신촌점 19시</code>',
      '• 장소는 띄어쓰기 없이 (예: 신촌점)',
      '• 시간은 19시 / 19:00 / 오후 7시 형식',
    ].join('\n'),
    { parse_mode: 'HTML', disable_notification: true },
  );
}

async function dateAdd(rest: string): Promise<void> {
  const parts = rest.split(/\s+/).filter(Boolean);
  if (parts.length < 3) {
    await sendDateUsage();
    return;
  }
  const [dateStr, venue, ...timeParts] = parts;
  if (!isValidDateStr(dateStr)) {
    await sendMessage('날짜 형식이 올바르지 않아요. 예: 2025-05-24', {
      disable_notification: true,
    });
    return;
  }
  const timeLabel = parseTimeLabel(timeParts.join(' '));

  const { data: dup } = await supabaseAdmin
    .from('event_sessions')
    .select('id')
    .eq('event_date', dateStr)
    .eq('venue', venue)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();
  if (dup) {
    await sendMessage('이미 등록된 세션이에요 (같은 날짜·장소).', {
      disable_notification: true,
    });
    return;
  }

  const id = genSlug(dateStr);
  const { error } = await supabaseAdmin.from('event_sessions').insert({
    id,
    event_date: dateStr,
    venue,
    time_label: timeLabel,
    is_active: true,
  });
  if (error) {
    await sendMessage(`추가 실패: ${error.message}`, {
      disable_notification: true,
    });
    return;
  }

  await sendMessage(
    `✅ <b>세션 추가됨</b>\n${dateParen(dateStr)} · ${escapeHtml(venue)} · ${escapeHtml(timeLabel)}`,
    { parse_mode: 'HTML', disable_notification: true },
  );
  await sendDateList();
}

async function renderDateList(): Promise<{
  text: string;
  reply_markup: InlineKeyboardMarkup;
}> {
  const { data, error } = await supabaseAdmin
    .from('event_sessions')
    .select('id, event_date, venue, time_label, is_active')
    .order('event_date', { ascending: true });

  const lines: string[] = ['📅 <b>참여 날짜 세션</b>'];
  const buttons: InlineKeyboardButton[][] = [];

  if (error) {
    lines.push('', `조회 실패: ${escapeHtml(error.message)}`);
    return { text: lines.join('\n'), reply_markup: { inline_keyboard: [] } };
  }

  const rows = (data ?? []) as EventSession[];
  const active = rows.filter((r) => r.is_active);
  const inactive = rows.filter((r) => !r.is_active);

  if (active.length === 0) {
    lines.push('', '활성 세션이 없어요.');
  } else {
    lines.push('', `<b>활성 (${active.length})</b>`);
    active.forEach((s, i) => {
      lines.push(
        `${i + 1}. ${dateParen(s.event_date)} · ${escapeHtml(s.venue)} · ${escapeHtml(s.time_label)}`,
      );
      buttons.push([
        {
          text: `🗑 ${i + 1}. ${dateParen(s.event_date)} ${s.venue}`,
          callback_data: `datedel:${s.id}`,
        },
      ]);
    });
  }

  if (inactive.length > 0) {
    lines.push('', `<b>비활성 (${inactive.length})</b> — 폼에서 숨김`);
    inactive.forEach((s) => {
      lines.push(
        `· ${dateParen(s.event_date)} · ${escapeHtml(s.venue)} · ${escapeHtml(s.time_label)}`,
      );
      buttons.push([
        {
          text: `↩ 활성화 ${dateParen(s.event_date)} ${s.venue}`,
          callback_data: `dateact:${s.id}`,
        },
      ]);
    });
  }

  lines.push('', '<i>추가: /date add 2025-05-24 신촌점 19시</i>');

  return {
    text: lines.join('\n'),
    reply_markup: { inline_keyboard: buttons },
  };
}

async function sendDateList(): Promise<void> {
  const { text, reply_markup } = await renderDateList();
  await sendMessage(text, {
    parse_mode: 'HTML',
    disable_notification: true,
    reply_markup,
  });
}

async function refreshDateListMessage(
  cb: TelegramCallbackQuery,
): Promise<void> {
  const { text, reply_markup } = await renderDateList();
  const msgId = cb.message?.message_id;
  if (msgId === undefined) {
    await sendMessage(text, {
      parse_mode: 'HTML',
      disable_notification: true,
      reply_markup,
    });
    return;
  }
  try {
    await editMessageText(msgId, text, {
      parse_mode: 'HTML',
      reply_markup,
    });
  } catch {
    await sendMessage(text, {
      parse_mode: 'HTML',
      disable_notification: true,
      reply_markup,
    });
  }
}

async function dateActionDelete(
  sessionId: string,
  cb: TelegramCallbackQuery,
): Promise<void> {
  const { data: session } = await supabaseAdmin
    .from('event_sessions')
    .select('id, event_date, venue, time_label')
    .eq('id', sessionId)
    .maybeSingle();
  if (!session) {
    await answerCallbackQuery(cb.id, '세션을 찾을 수 없어요', true);
    return;
  }

  // Only non-cancelled signups count — those are the ones the delete will
  // soft-delete (status → 'cancelled').
  const { count, error: cntErr } = await supabaseAdmin
    .from('signups')
    .select('id', { count: 'exact', head: true })
    .eq('event_session_id', sessionId)
    .neq('status', 'cancelled');
  if (cntErr) {
    await answerCallbackQuery(cb.id, `조회 실패: ${cntErr.message}`, true);
    return;
  }
  const n = count ?? 0;

  // No active signups → delete the session row outright.
  if (n === 0) {
    const { error: delErr } = await supabaseAdmin
      .from('event_sessions')
      .delete()
      .eq('id', sessionId);
    if (delErr) {
      await answerCallbackQuery(cb.id, `삭제 실패: ${delErr.message}`, true);
      return;
    }
    await answerCallbackQuery(cb.id, '🗑 삭제됨');
    await refreshDateListMessage(cb);
    return;
  }

  // Has signups → confirm first. Confirming soft-deletes them (cancelled),
  // which releases the phone-unique constraint and the blocked check so they
  // can re-apply for another session cleanly.
  await answerCallbackQuery(cb.id);
  await sendMessage(
    [
      '⚠️ <b>삭제 확인</b>',
      `삭제하려는 <b>${dateParen(session.event_date)} ${escapeHtml(session.venue)}</b> 에 <b>${n}명</b>의 신청자가 존재합니다.`,
      '정말 삭제 하실건가요?',
      '<i>신청자 전원이 거절 정리됩니다 — R2 사진·채팅 사진 메시지 삭제, 확인/입금 버튼 제거. 단 차단은 안 하므로 같은 번호로 다시 신청할 수 있어요.</i>',
    ].join('\n'),
    {
      parse_mode: 'HTML',
      disable_notification: true,
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: `✅ 정말 삭제 (${n}명 정리)`,
              callback_data: `datedelc:${sessionId}`,
            },
            { text: '취소', callback_data: `datedelx:${sessionId}` },
          ],
        ],
      },
    },
  );
}

async function dateActionDeleteConfirm(
  sessionId: string,
  cb: TelegramCallbackQuery,
): Promise<void> {
  const { data: session } = await supabaseAdmin
    .from('event_sessions')
    .select('id, event_date, venue')
    .eq('id', sessionId)
    .maybeSingle();

  // Pull every non-cancelled signup and reject-clean each: delete R2 photos,
  // delete the chat photo messages, strip the notify message's buttons.
  // status → 'cancelled' (NOT 'blocked'), so the partial unique index
  // excludes them and the blocked check ignores them — same phone can sign
  // up again cleanly.
  const { data: rows, error: fetchErr } = await supabaseAdmin
    .from('signups')
    .select('*')
    .eq('event_session_id', sessionId)
    .neq('status', 'cancelled');
  if (fetchErr) {
    await answerCallbackQuery(cb.id, `조회 실패: ${fetchErr.message}`, true);
    return;
  }

  const operator = cb.from;
  const operatorName = formatUserName(operator);
  const now = new Date().toISOString();
  const signups = (rows ?? []) as Array<
    SignupRecord & {
      telegram_notify_msg_id: number | null;
      telegram_photo_msg_ids: number[] | null;
    }
  >;

  for (const s of signups) {
    try {
      await purgeSignupPhotos(s);
    } catch (e) {
      // R2 delete genuinely failed — skip this signup so its row/keys stay
      // accurate and a re-run of the cancel can finish the cleanup, rather
      // than marking it cancelled with the object still in the bucket.
      console.error(`Session cancel: R2 purge failed for ${s.id}:`, e);
      continue;
    }

    if (s.telegram_photo_msg_ids?.length) {
      await Promise.allSettled(
        s.telegram_photo_msg_ids.map((mid) => deleteMessage(mid)),
      );
    }

    const { data: updated, error: updErr } = await supabaseAdmin
      .from('signups')
      .update({
        status: 'cancelled',
        photo_id_key: null,
        photo_employment_key: null,
        photos_purged_at: now,
        photos_purged_by_id: operator.id,
        photos_purged_by: operatorName,
      })
      .eq('id', s.id)
      .select()
      .single();
    if (updErr || !updated) continue;

    if (s.telegram_notify_msg_id) {
      try {
        await refreshNotifyMessage(
          updated as SignupRecord,
          s.telegram_notify_msg_id,
        );
      } catch (e) {
        console.error('Refresh notify failed:', e);
      }
    }
  }

  const n = signups.length;

  const { error: delErr } = await supabaseAdmin
    .from('event_sessions')
    .delete()
    .eq('id', sessionId);
  if (delErr) {
    await answerCallbackQuery(cb.id, `세션 삭제 실패: ${delErr.message}`, true);
    return;
  }

  await answerCallbackQuery(cb.id, `🗑 삭제됨 (${n}명 정리)`);
  const msgId = cb.message?.message_id;
  if (msgId !== undefined) {
    const label = session
      ? `${dateParen(session.event_date)} ${escapeHtml(session.venue)}`
      : escapeHtml(sessionId);
    try {
      await editMessageText(
        msgId,
        `🗑 <b>${label}</b> 삭제됨 — ${n}명 거절 정리(사진·메시지 삭제, 같은 번호 재신청 가능)`,
        { parse_mode: 'HTML', reply_markup: { inline_keyboard: [] } },
      );
    } catch {
      /* message gone — ignore */
    }
  }
  await sendDateList();
}

async function dateActionDeleteCancel(
  cb: TelegramCallbackQuery,
): Promise<void> {
  await answerCallbackQuery(cb.id, '취소됨');
  const msgId = cb.message?.message_id;
  if (msgId !== undefined) {
    try {
      await editMessageText(msgId, '❌ 삭제 취소됨', {
        reply_markup: { inline_keyboard: [] },
      });
    } catch {
      /* message gone — ignore */
    }
  }
}

async function dateActionActivate(
  sessionId: string,
  cb: TelegramCallbackQuery,
): Promise<void> {
  const { error } = await supabaseAdmin
    .from('event_sessions')
    .update({ is_active: true })
    .eq('id', sessionId);
  if (error) {
    await answerCallbackQuery(cb.id, `실패: ${error.message}`, true);
    return;
  }
  await answerCallbackQuery(cb.id, '✅ 활성화됨');
  await refreshDateListMessage(cb);
}

async function sendHelp(): Promise<void> {
  const text = [
    '🤖 <b>봇 사용법</b>',
    '',
    '<b>명령어</b>',
    '/status (또는 "현황") — 신청 현황 카운트',
    '/list (또는 "목록") — 상태별 신청 목록',
    '/paid abc12345 [def67890 ...] — 입금 완료 처리 (배치)',
    '/date — 참여 날짜 세션 목록 (버튼으로 삭제/활성화)',
    '/date add 2025-05-24 신촌점 19시 — 세션 추가',
    '/help (또는 "도움말") — 이 메시지',
    '',
    '<b>각 신청 메시지의 버튼</b>',
    '✓ 확인 — 본인확인 완료 (대기 → 입금 대기)',
    '💰 입금완료 — 입금 확인 (입금 대기 → 참가 확정)',
    '✗ 거절 — 차단 처리 (DB raw 보존, R2 사진 4종 삭제, 같은 번호 재신청 차단)',
    '🗑 신분증 폐기 — 신분증 사진만 R2에서 삭제',
    '🗑 모든 사진 폐기 — 얼굴/전신/신분증/직업인증 4종 일괄 삭제',
    '💬 메모 — 답장(reply)으로 메모 추가',
  ].join('\n');
  await sendMessage(text, { parse_mode: 'HTML', disable_notification: true });
}
