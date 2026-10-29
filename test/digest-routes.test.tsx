import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { DigestRow } from '../src/digest/types.js';

let runsDir: string;
const night = '2026-10-28';
const entry = (job: string, status: 'ok' | 'retry' | 'fail', at: string, owner: string | null = 'rook') =>
  JSON.stringify({ at, job, status, owner });

beforeEach(() => {
  runsDir = mkdtempSync(join(tmpdir(), 'rig-digest-routes-'));
});

afterEach(() => {
  rmSync(runsDir, { recursive: true, force: true });
});

function app() {
  return createApp({ adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir });
}

function writeNight(contents: string) {
  writeFileSync(join(runsDir, `${night}.jsonl`), contents);
}

describe('digest routes', () => {
  it('returns the same sorted jobs on the page and JSON endpoint', async () => {
    writeNight([
      entry('zeta', 'fail', '2026-10-28T23:00:00+01:00', null),
      entry('alpha', 'ok', '2026-10-28T22:00:00+01:00'),
    ].join('\n'));
    const service = app();
    const page = await service.request(`/digest/${night}`);
    const json = await service.request(`/api/digest/${night}`);
    expect(page.status).toBe(200);
    expect(json.status).toBe(200);
    const html = await page.text();
    const digest = await json.json() as { rows: DigestRow[]; badLines: number };
    expect(digest.rows.map((row) => row.job)).toEqual(['alpha', 'zeta']);
    expect(html).toContain('alpha');
    expect(html).toContain('zeta');
    expect(html.indexOf('alpha')).toBeLessThan(html.indexOf('zeta'));
    expect(html).toContain('—');
    expect(digest.rows[1].owner).toBeNull();
  });

  it('returns 404 on both endpoints when the night does not exist', async () => {
    const service = app();
    expect((await service.request(`/digest/${night}`)).status).toBe(404);
    expect((await service.request(`/api/digest/${night}`)).status).toBe(404);
  });

  it('renders an empty night and returns no rows', async () => {
    writeNight('');
    const service = app();
    const page = await service.request(`/digest/${night}`);
    const json = await service.request(`/api/digest/${night}`);
    expect(page.status).toBe(200);
    expect(await page.text()).toContain('nothing ran');
    expect(json.status).toBe(200);
    expect(await json.json()).toMatchObject({ rows: [], badLines: 0 });
  });

  it('keeps valid rows when a line is malformed', async () => {
    writeNight(`${entry('valid-job', 'ok', '2026-10-28T23:00:00+01:00')}\n{broken\n`);
    const service = app();
    const page = await service.request(`/digest/${night}`);
    const json = await service.request(`/api/digest/${night}`);
    expect(page.status).toBe(200);
    expect(await page.text()).toContain('valid-job');
    expect(json.status).toBe(200);
    const digest = await json.json() as { rows: DigestRow[]; badLines: number };
    expect(digest.rows.map((row) => row.job)).toEqual(['valid-job']);
    expect(digest.badLines).toBe(1);
  });
});
