import { describe, expect, it } from 'vitest';
import { ensureTrailhead, TRAILHEAD_ID, createTrailheadFile } from '../trailhead';
import { getInitialVaultFiles } from '../../data/initialVault';

describe('Trailhead', () => {
  it('is part of the starter vault', () => {
    expect(getInitialVaultFiles()[0].id).toBe(TRAILHEAD_ID);
  });

  it('is added to vaults that lack it, at the front', () => {
    const others = getInitialVaultFiles().filter((f) => f.id !== TRAILHEAD_ID);
    const res = ensureTrailhead(others);
    expect(res.added).toBe(true);
    expect(res.files[0].id).toBe(TRAILHEAD_ID);
    expect(res.files).toHaveLength(others.length + 1);
  });

  it('never replaces an existing (edited) Trailhead', () => {
    const edited = { ...createTrailheadFile(), content: '# My own home page\n' };
    const res = ensureTrailhead([edited]);
    expect(res.added).toBe(false);
    expect(res.files[0].content).toBe('# My own home page\n');
  });
});
