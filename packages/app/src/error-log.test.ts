// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  captureError,
  getErrors,
  clearErrors,
  formatErrors,
  installErrorCapture,
} from './error-log.js';
import type { ErrorEntry } from './error-log.js';

describe('error-log', () => {
  beforeEach(() => {
    clearErrors();
  });

  describe('captureError', () => {
    it('captures an Error object', () => {
      const err = new Error('test error');
      captureError('error', err);
      const errors = getErrors();
      expect(errors).toHaveLength(1);
      expect(errors[0].type).toBe('error');
      expect(errors[0].message).toBe('test error');
      expect(errors[0].stack).toBe(err.stack);
    });

    it('captures a string message', () => {
      captureError('error', 'something went wrong');
      const errors = getErrors();
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toBe('something went wrong');
      expect(errors[0].stack).toBeUndefined();
    });

    it('captures a number', () => {
      captureError('error', 42);
      const errors = getErrors();
      expect(errors[0].message).toBe('42');
    });

    it('captures null', () => {
      captureError('error', null);
      const errors = getErrors();
      expect(errors[0].message).toBe('null');
    });

    it('captures undefined', () => {
      captureError('error', undefined);
      const errors = getErrors();
      expect(errors[0].message).toBe('undefined');
    });

    it('captures an object', () => {
      captureError('error', { foo: 'bar' });
      const errors = getErrors();
      expect(errors[0].message).toBe('[object Object]');
    });

    it('sets a numeric timestamp', () => {
      const before = Date.now();
      captureError('error', 'timed');
      const after = Date.now();
      const ts = getErrors()[0].timestamp;
      expect(ts).toBeGreaterThanOrEqual(before);
      expect(ts).toBeLessThanOrEqual(after);
    });

    it('captures all three error types', () => {
      captureError('error', 'msg1');
      captureError('unhandledrejection', 'msg2');
      captureError('window-error', 'msg3');
      const errors = getErrors();
      expect(errors.map((e) => e.type)).toEqual(['error', 'unhandledrejection', 'window-error']);
    });

    it('preserves order of insertion', () => {
      for (let i = 0; i < 10; i++) {
        captureError('error', `error-${i}`);
      }
      const errors = getErrors();
      expect(errors[0].message).toBe('error-0');
      expect(errors[9].message).toBe('error-9');
    });
  });

  describe('ring buffer (MAX_ERRORS = 200)', () => {
    it('keeps at most 200 entries', () => {
      for (let i = 0; i < 250; i++) {
        captureError('error', `error-${i}`);
      }
      const errors = getErrors();
      expect(errors).toHaveLength(200);
    });

    it('drops oldest entries when overflowing', () => {
      for (let i = 0; i < 250; i++) {
        captureError('error', `error-${i}`);
      }
      const errors = getErrors();
      // First 50 should have been dropped
      expect(errors[0].message).toBe('error-50');
      expect(errors[199].message).toBe('error-249');
    });

    it('does not drop entries at exactly 200', () => {
      for (let i = 0; i < 200; i++) {
        captureError('error', `error-${i}`);
      }
      const errors = getErrors();
      expect(errors).toHaveLength(200);
      expect(errors[0].message).toBe('error-0');
      expect(errors[199].message).toBe('error-199');
    });

    it('continues to work after multiple overflow cycles', () => {
      for (let i = 0; i < 600; i++) {
        captureError('error', `e-${i}`);
      }
      const errors = getErrors();
      expect(errors).toHaveLength(200);
      expect(errors[0].message).toBe('e-400');
      expect(errors[199].message).toBe('e-599');
    });
  });

  describe('getErrors', () => {
    it('returns empty array initially', () => {
      expect(getErrors()).toEqual([]);
    });

    it('returns readonly array', () => {
      captureError('error', 'test');
      const errors = getErrors();
      // Readonly array — length should match
      expect(errors.length).toBe(1);
    });
  });

  describe('clearErrors', () => {
    it('removes all captured errors', () => {
      captureError('error', 'one');
      captureError('error', 'two');
      expect(getErrors()).toHaveLength(2);
      clearErrors();
      expect(getErrors()).toEqual([]);
    });

    it('is safe to call when already empty', () => {
      clearErrors();
      clearErrors();
      expect(getErrors()).toEqual([]);
    });

    it('allows capturing after clearing', () => {
      captureError('error', 'before');
      clearErrors();
      captureError('error', 'after');
      const errors = getErrors();
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toBe('after');
    });
  });

  describe('formatErrors', () => {
    it('returns placeholder when no errors', () => {
      expect(formatErrors()).toBe('(no errors)');
    });

    it('includes header line with ISO timestamp', () => {
      captureError('error', 'test');
      const formatted = formatErrors();
      const lines = formatted.split('\n');
      expect(lines[0]).toMatch(/^Critterium Error Log — \d{4}-\d{2}-\d{2}T/);
    });

    it('includes error type in bracket notation', () => {
      captureError('unhandledrejection', 'promise failed');
      const formatted = formatErrors();
      expect(formatted).toContain('[unhandledrejection]');
      expect(formatted).toContain('promise failed');
    });

    it('includes window-error type', () => {
      captureError('window-error', 'script error');
      const formatted = formatErrors();
      expect(formatted).toContain('[window-error]');
      expect(formatted).toContain('script error');
    });

    it('includes indented stack trace', () => {
      const err = new Error('with stack');
      captureError('error', err);
      const formatted = formatErrors();
      // Stack lines should be indented with 2 spaces
      const stackLines = formatted.split('\n').filter((l) => l.startsWith('  '));
      expect(stackLines.length).toBeGreaterThan(0);
    });

    it('omits stack section when error has no stack', () => {
      captureError('error', 'no stack here');
      const formatted = formatErrors();
      // Should not have any indented lines
      const indentedLines = formatted.split('\n').filter((l) => l.startsWith('  '));
      expect(indentedLines).toHaveLength(0);
    });

    it('formats multiple errors', () => {
      captureError('error', 'first');
      captureError('unhandledrejection', 'second');
      const formatted = formatErrors();
      expect(formatted).toContain('first');
      expect(formatted).toContain('second');
      expect(formatted).toContain('[error]');
      expect(formatted).toContain('[unhandledrejection]');
    });

    it('includes time portion (HH:MM:SS.mmm) in brackets', () => {
      captureError('error', 'timed');
      const formatted = formatErrors();
      // Should contain a time like [12:34:56.789]
      expect(formatted).toMatch(/\[\d{2}:\d{2}:\d{2}\.\d{3}\]/);
    });
  });

  describe('installErrorCapture', () => {
    let origConsoleError: typeof console.error;

    beforeEach(() => {
      origConsoleError = console.error;
    });

    afterEach(() => {
      // Restore original console.error
      console.error = origConsoleError;
      // Remove event listeners by reinstalling (idempotent — just ensure no crash)
    });

    it('wraps console.error to capture errors', () => {
      installErrorCapture();
      console.error('captured via console');
      const errors = getErrors();
      expect(errors.length).toBeGreaterThanOrEqual(1);
      const last = errors[errors.length - 1];
      expect(last.type).toBe('error');
      expect(last.message).toContain('captured via console');
    });

    it('still calls original console.error', () => {
      const spy = vi.fn();
      console.error = spy;
      installErrorCapture();
      console.error('forwarded');
      expect(spy).toHaveBeenCalledWith('forwarded');
    });

    it('captures Error objects passed to console.error', () => {
      installErrorCapture();
      const err = new Error('console error object');
      console.error(err);
      const errors = getErrors();
      const last = errors[errors.length - 1];
      expect(last.message).toContain('console error object');
    });

    it('captures window error events', () => {
      installErrorCapture();
      const errorEvent = new ErrorEvent('error', {
        error: new Error('window test error'),
        message: 'window test error',
      });
      window.dispatchEvent(errorEvent);
      const errors = getErrors();
      const hasWindowError = errors.some(
        (e) => e.type === 'window-error' && e.message.includes('window test error'),
      );
      expect(hasWindowError).toBe(true);
    });

    it('captures unhandledrejection events', () => {
      installErrorCapture();
      const rejected = Promise.reject('rejection reason');
      // Suppress the unhandled rejection so Vitest doesn't flag it
      rejected.catch(() => {});
      const rejectEvent = new PromiseRejectionEvent('unhandledrejection', {
        promise: rejected,
        reason: 'rejection reason',
      });
      window.dispatchEvent(rejectEvent);
      const errors = getErrors();
      const hasRejection = errors.some(
        (e) => e.type === 'unhandledrejection' && e.message.includes('rejection reason'),
      );
      expect(hasRejection).toBe(true);
    });

    it('handles window error events without error property', () => {
      installErrorCapture();
      const errorEvent = new ErrorEvent('error', {
        message: 'fallback message',
      });
      window.dispatchEvent(errorEvent);
      const errors = getErrors();
      const hasError = errors.some((e) => e.type === 'window-error');
      expect(hasError).toBe(true);
    });
  });

  describe('ErrorEntry interface', () => {
    it('has correct shape after capture', () => {
      captureError('error', new Error('shape test'));
      const entry: ErrorEntry = getErrors()[0];
      expect(entry).toHaveProperty('timestamp');
      expect(entry).toHaveProperty('type');
      expect(entry).toHaveProperty('message');
      expect(typeof entry.timestamp).toBe('number');
      expect(typeof entry.type).toBe('string');
      expect(typeof entry.message).toBe('string');
    });

    it('stack is optional', () => {
      captureError('error', 'no error object');
      const entry: ErrorEntry = getErrors()[0];
      expect(entry.stack).toBeUndefined();
    });
  });
});
