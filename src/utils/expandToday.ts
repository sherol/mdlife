/**
 * Replaces every `@today` token (case-insensitive) in `text` with `todayStr` and maps the caret
 * position through the replacement, so the caret stays where the user was typing.
 *
 * - Tokens ending at or before the caret shift it by the length difference.
 * - A token the caret sits inside (e.g. "@to|day") puts the caret right after the inserted date.
 * - Tokens after the caret don't move it.
 */
export function expandTodayTokens(
  text: string,
  cursor: number,
  todayStr: string
): { text: string; cursor: number } {
  const re = /@today/gi;
  let out = '';
  let last = 0;
  let newCursor = cursor;
  let match: RegExpExecArray | null;

  while ((match = re.exec(text)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    out += text.slice(last, start);
    const replacedEnd = out.length + todayStr.length;
    if (end <= cursor) {
      newCursor += todayStr.length - match[0].length;
    } else if (start < cursor) {
      newCursor = replacedEnd;
    }
    out += todayStr;
    last = end;
  }
  out += text.slice(last);

  return { text: out, cursor: Math.max(0, Math.min(newCursor, out.length)) };
}
