/**
 * Critterium — Error Log
 *
 * Captures all runtime errors (console.error, unhandled rejections, onerror)
 * into a ring buffer that can be viewed/cleared from the Actions panel.
 */

export interface ErrorEntry {
  timestamp: number;
  type: 'error' | 'unhandledrejection' | 'window-error';
  message: string;
  stack?: string;
}

const MAX_ERRORS = 200;
const errors: ErrorEntry[] = [];

/** Capture an error entry. */
export function captureError(type: ErrorEntry['type'], err: unknown): void {
  const entry: ErrorEntry = {
    timestamp: Date.now(),
    type,
    message: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
  };
  errors.push(entry);
  if (errors.length > MAX_ERRORS) errors.shift();
}

/** Get all captured errors. */
export function getErrors(): readonly ErrorEntry[] {
  return errors;
}

/** Clear all captured errors. */
export function clearErrors(): void {
  errors.length = 0;
}

/** Format errors as a single text block for export. */
export function formatErrors(): string {
  if (errors.length === 0) return '(no errors)';
  const lines: string[] = [`Critterium Error Log — ${new Date().toISOString()}`, ''];
  for (const e of errors) {
    const time = new Date(e.timestamp).toISOString().slice(11, 23);
    lines.push(`[${time}] [${e.type}] ${e.message}`);
    if (e.stack) {
      // Indent stack lines
      lines.push(e.stack.split('\n').map(l => '  ' + l).join('\n'));
    }
    lines.push('');
  }
  return lines.join('\n');
}

/** Install global error interceptors. Call once at app startup. */
export function installErrorCapture(): void {
  const origConsoleError = console.error;
  console.error = (...args: unknown[]) => {
    origConsoleError.apply(console, args);
    captureError('error', args.map(a => (a instanceof Error ? a.message + '\n' + a.stack : String(a))).join(' '));
  };

  window.addEventListener('error', (e) => {
    captureError('window-error', e.error ?? e.message);
  });

  window.addEventListener('unhandledrejection', (e) => {
    captureError('unhandledrejection', e.reason);
  });
}
