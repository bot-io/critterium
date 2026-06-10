import { describe, it, expect } from 'vitest';
import { MAX_TYPES } from './index.js';

describe('core sanity', () => {
  it('exports MAX_TYPES as 16', () => {
    expect(MAX_TYPES).toBe(16);
  });
});
