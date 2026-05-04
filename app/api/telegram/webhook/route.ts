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

const ID_PRESIGNED_TTL_SECONDS = 4 * 60 * 60;
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
      await answerCallbackQuery(cb.id, '✓ 확인 완료');
    } else if (action === 'reject') {
      await actionReject(signupId, notifyMsgId, operatorName);
      await answerCallbackQuery(cb.id, '✗ 거절 — 데이터 삭제됨');
    } else if (action === 'delete_id') {
      await actionDeleteId(signupId, notifyMsgId, operator.id, operatorName);
      await answerCallbackQuery(cb.id, '🗑 신분증 폐기 완료');
    } else if (action === 'memo') {
      await actionMemoPrompt(signupId, operatorName);
      await answerCallbackQuery(cb.id, '메모를 입력해주세요');
    } else {
      await answerCallbackQuery(cb.id);
    }
  } catch (err) {
    console.error(`Action ${action} failed:`, err);
    await answerCallbackQuery(cb.id, '처리 중 오류가 발생했어요', true);
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

async function actionReject(
  signupId: string,
  notifyMsgId: number,
  operatorName: string,
): Promise<void> {
  const { data: signup, error: fetchErr } = await supabaseAdmin
    .from('signups')
    .select('*')
    .eq('id', signupId)
    .single();
  if (fetchErr || !signup) throw new Error(`Signup not found`);

  const s = signup as SignupRecord & {
    telegram_photo_msg_ids: number[] | null;
  };

  const faceKey = r2KeyFromUrl(s.photo_face_url, publicBaseUrl!);
  const bodyKey = r2KeyFromUrl(s.photo_body_url, publicBaseUrl!);
  await Promise.allSettled([
    deletePublic(faceKey),
    deletePublic(bodyKey),
    s.photo_id_key ? deletePrivate(s.photo_id_key) : Promise.resolve(),
  ]);

  const { error: delErr } = await supabaseAdmin
    .from('signups')
    .delete()
    .eq('id', signupId);
  if (delErr) throw new Error(`DB delete failed: ${delErr.message}`);

  const ts = new Date().toISOString();
  const text = [
    '❌ <b>거절됨</b>',
    `ID: <code>${signupId.slice(0, 8)}</code>`,
    `${escapeHtml(operatorName)} · ${formatTimestamp(ts)}`,
    '',
    '이 신청은 거절되어 모든 데이터(DB + 사진)가 삭제되었어요.',
  ].join('\n');
  await editMessageText(notifyMsgId, text, {
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    reply_markup: { inline_keyboard: [] },
  });

  if (s.telegram_photo_msg_ids) {
    for (const photoMsgId of s.telegram_photo_msg_ids) {
      try {
        await deleteMessage(photoMsgId);
      } catch (e) {
        console.error(`Failed to delete photo msg ${photoMsgId}:`, e);
      }
    }
  }
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
  let presignedUrl: string | null = null;
  if (signup.photo_id_key) {
    presignedUrl = await getPrivatePresignedUrl(
      signup.photo_id_key,
      ID_PRESIGNED_TTL_SECONDS,
    );
  }
  const text = formatNotification(signup, presignedUrl);
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
  let cancelled = 0;
  for (const row of rows) {
    if (row.status === 'pending') pending++;
    else if (row.status === 'normal') normal++;
    else if (row.status === 'cancelled') cancelled++;
  }

  const lines = [
    '📊 <b>신청 현황</b>',
    '',
    `총 ${rows.length}건`,
    `🟡 대기: ${pending}건`,
    `✓ 확인: ${normal}건`,
  ];
  if (cancelled > 0) lines.push(`✗ 취소: ${cancelled}건`);
  await sendMessage(lines.join('\n'), { parse_mode: 'HTML' });
}

async function sendList(): Promise<void> {
  const { data, error } = await supabaseAdmin
    .from('signups')
    .select('id, name, status, created_at')
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) {
    await sendMessage(`목록 조회 실패: ${error.message}`);
    return;
  }
  if (!data || data.length === 0) {
    await sendMessage('아직 신청이 없어요.');
    return;
  }

  const STATUS_BADGE: Record<string, string> = {
    pending: '🟡',
    normal: '✓',
    cancelled: '✗',
  };

  const lines = ['📋 <b>최근 신청 (최대 20건)</b>', ''];
  data.forEach((row, i) => {
    const status = row.status as string;
    const badge = STATUS_BADGE[status] ?? '?';
    const ts = formatTimestamp(row.created_at as string);
    lines.push(`${i + 1}. ${badge} ${escapeHtml(row.name as string)} · ${ts}`);
  });
  await sendMessage(lines.join('\n'), { parse_mode: 'HTML' });
}

async function sendHelp(): Promise<void> {
  const text = [
    '🤖 <b>봇 사용법</b>',
    '',
    '<b>명령어</b>',
    '/status (또는 "현황") — 신청 현황 통계',
    '/list (또는 "목록") — 최근 신청 20건',
    '/help (또는 "도움말") — 이 메시지',
    '',
    '<b>각 신청 메시지의 버튼</b>',
    '✓ 확인 — 본인확인 완료 처리',
    '✗ 거절 — 신청 거절 (DB + R2 사진 모두 삭제)',
    '🗑 신분증 폐기 — 신분증 사진만 R2에서 삭제',
    '💬 메모 — 답장(reply)으로 메모 추가',
  ].join('\n');
  await sendMessage(text, { parse_mode: 'HTML' });
}
