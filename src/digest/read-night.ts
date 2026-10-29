import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, DigestStatus, ReadNight } from './types.js';

type LogEntry = {
  at: string;
  job: string;
  status: DigestStatus;
  owner: string | null;
  error?: string;
};

function parseEntry(line: string): LogEntry | null {
  try {
    const value: unknown = JSON.parse(line);
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
    const entry = value as Record<string, unknown>;
    if (typeof entry.at !== 'string' || !Number.isFinite(Date.parse(entry.at)) ||
      typeof entry.job !== 'string' || !entry.job ||
      (entry.status !== 'ok' && entry.status !== 'retry' && entry.status !== 'fail') ||
      (entry.owner !== null && typeof entry.owner !== 'string') ||
      (entry.error !== undefined && typeof entry.error !== 'string')) return null;
    return { at: entry.at, job: entry.job, status: entry.status, owner: entry.owner, error: entry.error };
  } catch {
    return null;
  }
}

export const readNight: ReadNight = (runsDir, night) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(night)) return null;
  let contents: string;
  try {
    contents = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }

  const rows = new Map<string, DigestRow>();
  const errorTimes = new Map<string, number>();
  let badLines = 0;
  const lines = contents.split(/\r?\n/);
  if (lines.at(-1) === '') lines.pop();
  for (const line of lines) {
    const entry = parseEntry(line);
    if (!entry) {
      badLines++;
      continue;
    }
    const time = Date.parse(entry.at);
    const row = rows.get(entry.job);
    if (!row) {
      rows.set(entry.job, {
        job: entry.job, owner: entry.owner, runs: 1,
        retries: entry.status === 'retry' ? 1 : 0, lastStatus: entry.status,
        lastError: entry.error ?? null, firstTime: entry.at, lastTime: entry.at,
      });
      if (entry.error !== undefined) errorTimes.set(entry.job, time);
      continue;
    }
    row.runs++;
    if (entry.status === 'retry') row.retries++;
    if (time < Date.parse(row.firstTime)) row.firstTime = entry.at;
    if (time >= Date.parse(row.lastTime)) {
      row.lastTime = entry.at;
      row.lastStatus = entry.status;
      row.owner = entry.owner;
    }
    if (entry.error !== undefined && time >= (errorTimes.get(entry.job) ?? -Infinity)) {
      row.lastError = entry.error;
      errorTimes.set(entry.job, time);
    }
  }
  return { rows: [...rows.values()].sort((a, b) => a.job < b.job ? -1 : a.job > b.job ? 1 : 0), badLines };
};
