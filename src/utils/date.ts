/**
 * Date formatting helpers for Markdown Life & Skills Vault.
 */

/**
 * Returns today's date formatted as YY-MM-DD string (e.g. "26-10-10")
 */
export function getTodayYYMMDD(d: Date = new Date()): string {
  const yy = String(d.getFullYear()).slice(-2);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}
