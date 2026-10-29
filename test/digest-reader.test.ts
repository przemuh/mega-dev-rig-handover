import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/read-night.js';

describe('readNight', () => {
  it('aggregates the sample night and counts the broken line', () => {
    const digest = readNight('runs', '2026-10-28');
    expect(digest?.badLines).toBe(1);
    expect(digest?.rows.map((row) => row.job)).toEqual([
      'digest/render', 'fixtures/refresh', 'lane/sync', 'notes/backup', 'rig/rotate-logs',
    ]);
    expect(digest?.rows[0].owner).toBeNull();
    expect(digest?.rows[1]).toMatchObject({ runs: 4, retries: 3, lastStatus: 'ok', lastError: 'upstream 503' });
    expect(digest?.rows[3]).toMatchObject({ runs: 1, lastStatus: 'fail', lastError: 'quota exceeded' });
  });

  it('handles absent, empty, invalid, and out-of-order data', () => {
    const dir = mkdtempSync(join(tmpdir(), 'rig-digest-'));
    try {
      expect(readNight(dir, '2026-10-01')).toBeNull();
      writeFileSync(join(dir, '2026-10-01.jsonl'), '');
      expect(readNight(dir, '2026-10-01')).toEqual({ rows: [], badLines: 0 });
      writeFileSync(join(dir, '2026-10-01.jsonl'), [
        JSON.stringify({ at: '2026-10-01T03:00:00+02:00', job: 'a', status: 'ok', owner: null }),
        'bad json',
        JSON.stringify({ at: '2026-10-01T00:00:00+01:00', job: 'a', status: 'retry', owner: 'rook', error: 'retry' }),
        JSON.stringify({ at: 'bad', job: 'b', status: 'ok', owner: null }),
      ].join('\n'));
      expect(readNight(dir, '2026-10-01')).toEqual({ badLines: 2, rows: [{
        job: 'a', owner: null, runs: 2, retries: 1, lastStatus: 'ok', lastError: 'retry',
        firstTime: '2026-10-01T00:00:00+01:00', lastTime: '2026-10-01T03:00:00+02:00',
      }] });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
