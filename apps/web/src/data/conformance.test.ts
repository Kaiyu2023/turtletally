import { describe, expect, it } from 'vitest';
import { buildConformanceVector, serialiseConformanceVector } from './conformance';

const vectorPath = '../../../../crates/domain/tests/conformance-vector.json';

describe('conformance vector', () => {
  // Regenerate with `npm run contract:vector` whenever the fixtures or the
  // contract change; ADR 0008 makes the diff part of review.
  it('matches the committed vector the Rust crate conforms to', async () => {
    await expect(serialiseConformanceVector()).toMatchFileSnapshot(vectorPath);
  });

  it('covers a month with a ledger, a month without one, and the comparison window', () => {
    const vector = buildConformanceVector();
    const summaryFor = (month: string) => vector.expected.dashboards.find((entry) => entry.month === month)?.summary;

    expect(summaryFor('2026-08')?.transactionCount).toBeGreaterThan(0);
    expect(summaryFor('2026-09')?.transactionCount).toBe(0);
    expect(vector.expected.dashboards.find((entry) => entry.month === '2026-08')?.window.from).toBe('2026-07-01');
  });
});
