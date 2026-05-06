/** Normalize various `/ai/request` response shapes to display text. */
export function extractAgentReply(data) {
  if (data == null) return '';
  if (typeof data === 'string') return data;
  if (typeof data !== 'object') return String(data);

  const nested =
    data.data != null && typeof data.data === 'object' ? extractAgentReply(data.data) : '';
  if (nested) return nested;

  const direct =
    data.reply ??
    data.message ??
    data.text ??
    data.response ??
    data.output ??
    data.answer ??
    data.content;
  if (typeof direct === 'string' && direct.trim()) return direct;

  return '';
}
