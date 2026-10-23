/**
 * The `message` of a caught value, the same as `err?.message` on an Error (or an Error-like
 * object such as a Google API error); undefined when there is none.
 */
export function getErrorMessage(err: unknown): string | undefined {
  if (typeof err === 'object' && err !== null && 'message' in err) {
    const { message } = err;
    return typeof message === 'string' ? message : undefined;
  }
  return undefined;
}
