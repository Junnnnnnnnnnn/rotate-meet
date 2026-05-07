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
} from '@/lib/telegram';
import {
  formatNotification,
  buildButtons,
  formatTimestamp,
  r2KeyFromUrl,
  type SignupRecord,
  type AdminMemo,
} from '@/lib/format-notification';

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

  const faceKey = r2KeyFromUrl(s.photo_face_url, publicBaseUrl!);
  const bodyKey = r2KeyFromUrl(s.photo_body_url, publicBaseUrl!);
  await Promise.allSettled([
    deletePublic(faceKey),
    deletePublic(bodyKey),
    s.photo_id_key ? deletePrivate(s.photo_id_key) : Promise.resolve(),
    s.photo_employment_key ? deletePrivate(s.photo_employment_key) : Promise.resolve(),
  ]);

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

  const faceKey = r2KeyFromUrl(s.photo_face_url, publicBaseUrl!);
  const bodyKey = r2KeyFromUrl(s.photo_body_url, publicBaseUrl!);
  await Promise.allSettled([
    deletePublic(faceKey),
    deletePublic(bodyKey),
    s.photo_id_key ? deletePrivate(s.photo_id_key) : Promise.resolve(),
    s.photo_employment_key ? deletePrivate(s.photo_employment_key) : Promise.resolve(),
  ]);

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
  const cancelled = rows.filter((r) => r.status === 'cancelled');
  const blocked = rows.filter((r) => r.status === 'blocked');

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

  if (cancelled.length > 0) {
    lines.push('');
    lines.push(`✗ <b>취소 (${cancelled.length}건)</b>`);
    cancelled.forEach((r) => {
      globalIdx++;
      lines.push(`${globalIdx}. ${escapeHtml(r.name)}`);
    });
  }

  if (blocked.length > 0) {
    lines.push('');
    lines.push(`❌ <b>거절(차단) (${blocked.length}건)</b> — 같은 번호 재신청 차단됨`);
    blocked.forEach((r) => {
      globalIdx++;
      lines.push(
        `${globalIdx}. ${escapeHtml(r.name)} · ${escapeHtml(r.phone)}`,
      );
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

async function sendHelp(): Promise<void> {
  const text = [
    '🤖 <b>봇 사용법</b>',
    '',
    '<b>명령어</b>',
    '/status (또는 "현황") — 신청 현황 카운트',
    '/list (또는 "목록") — 상태별 신청 목록',
    '/paid abc12345 [def67890 ...] — 입금 완료 처리 (배치)',
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
