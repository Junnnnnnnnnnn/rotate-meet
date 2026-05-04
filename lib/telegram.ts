const TELEGRAM_API_BASE = 'https://api.telegram.org';

const botToken = process.env.TELEGRAM_BOT_TOKEN;
const chatId = process.env.TELEGRAM_CHAT_ID;

if (!botToken) throw new Error('TELEGRAM_BOT_TOKEN is not set');
if (!chatId) throw new Error('TELEGRAM_CHAT_ID is not set');

export const TELEGRAM_CHAT_ID = chatId;

export type InlineKeyboardButton = {
  text: string;
  callback_data?: string;
  url?: string;
};

export type InlineKeyboardMarkup = {
  inline_keyboard: InlineKeyboardButton[][];
};

export type ForceReply = {
  force_reply: true;
  selective?: boolean;
  input_field_placeholder?: string;
};

export type SendMessageOptions = {
  parse_mode?: 'HTML' | 'MarkdownV2';
  reply_markup?: InlineKeyboardMarkup | ForceReply;
  disable_web_page_preview?: boolean;
  reply_to_message_id?: number;
};

export type SendPhotoOptions = {
  caption?: string;
  parse_mode?: 'HTML' | 'MarkdownV2';
};

type TelegramResponse<T> = { ok: true; result: T } | { ok: false; description: string };

type TelegramMessage = { message_id: number };

async function callTelegram<T>(method: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${TELEGRAM_API_BASE}/bot${botToken}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as TelegramResponse<T>;
  if (!data.ok) {
    throw new Error(`Telegram ${method} failed: ${data.description}`);
  }
  return data.result;
}

export async function sendMessage(
  text: string,
  options: SendMessageOptions = {},
): Promise<TelegramMessage> {
  return callTelegram<TelegramMessage>('sendMessage', {
    chat_id: chatId,
    text,
    ...options,
  });
}

export async function sendPhoto(
  photoUrl: string,
  options: SendPhotoOptions = {},
): Promise<TelegramMessage> {
  return callTelegram<TelegramMessage>('sendPhoto', {
    chat_id: chatId,
    photo: photoUrl,
    ...options,
  });
}

export async function editMessageText(
  messageId: number,
  text: string,
  options: SendMessageOptions = {},
): Promise<void> {
  await callTelegram<TelegramMessage | true>('editMessageText', {
    chat_id: chatId,
    message_id: messageId,
    text,
    ...options,
  });
}

export async function deleteMessage(messageId: number): Promise<void> {
  await callTelegram<true>('deleteMessage', {
    chat_id: chatId,
    message_id: messageId,
  });
}

export async function editMessageReplyMarkup(
  messageId: number,
  replyMarkup: InlineKeyboardMarkup,
): Promise<void> {
  await callTelegram<TelegramMessage | true>('editMessageReplyMarkup', {
    chat_id: chatId,
    message_id: messageId,
    reply_markup: replyMarkup,
  });
}

export async function answerCallbackQuery(
  callbackQueryId: string,
  text?: string,
  showAlert = false,
): Promise<void> {
  await callTelegram<true>('answerCallbackQuery', {
    callback_query_id: callbackQueryId,
    text,
    show_alert: showAlert,
  });
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
