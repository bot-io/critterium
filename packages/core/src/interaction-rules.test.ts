import { describe, it, expect } from 'vitest';
import {
  InteractionRuleMatrix,
  FORCE_FLAGS,
  NO_INTERACTION,
  forceFlags,
  decodeForceFlags,
  type ForceType,
} from './interaction-rules.js';

describe('InteractionRuleMatrix', () => {
  it('creates an empty matrix for valid species count', () => {
    const m = new InteractionRuleMatrix(3);
    expect(m.speciesCount).toBe(3);
    expect(m.activeRuleCount).toBe(0);
  });

  it('rejects species count outside 1–12', () => {
    expect(() => new InteractionRuleMatrix(0)).toThrow();
    expect(() => new InteractionRuleMatrix(13)).toThrow();
  });

  it('defaults all rules to NO_INTERACTION', () => {
    const m = new InteractionRuleMatrix(3);
    for (let s = 0; s < 3; s++) {
      for (let t = 0; t < 3; t++) {
        const rule = m.get(s, t);
        expect(rule.enabledForces).toBe(0);
        expect(rule.radius).toBe(0);
        expect(rule.strength).toBe(0);
      }
    }
  });

  it('enables a force for a species pair', () => {
    const m = new InteractionRuleMatrix(3);
    m.enableForce(0, 1, 'attract', 60, 0.8);

    const rule = m.get(0, 1);
    expect(rule.enabledForces & FORCE_FLAGS.attract).not.toBe(0);
    expect(rule.radius).toBe(60);
    expect(rule.strength).toBe(0.8);
  });

  it('enables multiple forces on the same pair', () => {
    const m = new InteractionRuleMatrix(2);
    m.enableForce(0, 1, 'attract', 50, 1);
    m.enableForce(0, 1, 'flock', 50, 0.5);

    const rule = m.get(0, 1);
    expect(m.hasForce(0, 1, 'attract')).toBe(true);
    expect(m.hasForce(0, 1, 'flock')).toBe(true);
    expect(m.hasForce(0, 1, 'repel')).toBe(false);
  });

  it('disables a force without clearing others', () => {
    const m = new InteractionRuleMatrix(2);
    m.enableForce(0, 1, 'attract', 50, 1);
    m.enableForce(0, 1, 'flock', 50, 0.5);

    m.disableForce(0, 1, 'attract');
    expect(m.hasForce(0, 1, 'attract')).toBe(false);
    expect(m.hasForce(0, 1, 'flock')).toBe(true);
  });

  it('clears radius/strength when all forces disabled', () => {
    const m = new InteractionRuleMatrix(2);
    m.enableForce(0, 1, 'attract', 50, 1);
    m.disableForce(0, 1, 'attract');

    const rule = m.get(0, 1);
    expect(rule.enabledForces).toBe(0);
    expect(rule.radius).toBe(0);
    expect(rule.strength).toBe(0);
  });

  it('supports asymmetric rules', () => {
    const m = new InteractionRuleMatrix(2);
    m.enableForce(0, 1, 'eat', 20, 1); // 0 eats 1
    m.enableForce(1, 0, 'flee', 40, 0.8); // 1 flees from 0

    expect(m.hasForce(0, 1, 'eat')).toBe(true);
    expect(m.hasForce(1, 0, 'eat')).toBe(false);
    expect(m.hasForce(1, 0, 'flee')).toBe(true);
    expect(m.hasForce(0, 1, 'flee')).toBe(false);
  });

  it('activePairs returns correct pairs', () => {
    const m = new InteractionRuleMatrix(3);
    m.enableForce(0, 1, 'attract');
    m.enableForce(2, 0, 'repel');
    m.enableForce(1, 1, 'flock');

    const pairs = m.activePairs('attract');
    expect(pairs).toHaveLength(1);
    expect(pairs[0]).toEqual([0, 1]);

    const repelPairs = m.activePairs('repel');
    expect(repelPairs).toHaveLength(1);
    expect(repelPairs[0]).toEqual([2, 0]);
  });

  it('counts active rules correctly', () => {
    const m = new InteractionRuleMatrix(3);
    expect(m.activeRuleCount).toBe(0);

    m.enableForce(0, 1, 'attract');
    expect(m.activeRuleCount).toBe(1);

    m.enableForce(0, 1, 'flock'); // same pair
    expect(m.activeRuleCount).toBe(1);

    m.enableForce(1, 2, 'repel');
    expect(m.activeRuleCount).toBe(2);
  });

  it('throws on out-of-range species indices', () => {
    const m = new InteractionRuleMatrix(2);
    expect(() => m.get(-1, 0)).toThrow();
    expect(() => m.get(2, 0)).toThrow();
    expect(() => m.get(0, -1)).toThrow();
    expect(() => m.get(0, 2)).toThrow();
  });

  it('set() merges partial updates', () => {
    const m = new InteractionRuleMatrix(2);
    m.enableForce(0, 1, 'attract', 50, 1);
    m.set(0, 1, { strength: 0.3 }); // only change strength

    const rule = m.get(0, 1);
    expect(rule.enabledForces & FORCE_FLAGS.attract).not.toBe(0);
    expect(rule.radius).toBe(50);
    expect(rule.strength).toBe(0.3);
  });

  it('serializes to JSON with only active rules', () => {
    const m = new InteractionRuleMatrix(2);
    m.enableForce(0, 1, 'attract', 50, 1);

    const json = m.toJSON() as any;
    expect(json.speciesCount).toBe(2);
    expect(Object.keys(json.entries)).toHaveLength(1);
    expect(json.entries['0,1']).toBeDefined();
    expect(json.entries['0,1'].enabledForces).toBe(FORCE_FLAGS.attract);
  });
});

describe('forceFlags / decodeForceFlags', () => {
  it('builds flag from single force', () => {
    expect(forceFlags('attract')).toBe(FORCE_FLAGS.attract);
  });

  it('builds flag from multiple forces', () => {
    const flag = forceFlags('attract', 'flock', 'eat');
    expect(flag & FORCE_FLAGS.attract).not.toBe(0);
    expect(flag & FORCE_FLAGS.flock).not.toBe(0);
    expect(flag & FORCE_FLAGS.eat).not.toBe(0);
  });

  it('decodes flags back to force types', () => {
    const flag = forceFlags('repel', 'orbit');
    const decoded = decodeForceFlags(flag);
    expect(decoded).toContain('repel');
    expect(decoded).toContain('orbit');
    expect(decoded).toHaveLength(2);
  });

  it('empty flags decode to empty array', () => {
    expect(decodeForceFlags(0)).toHaveLength(0);
  });
});
