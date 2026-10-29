export type DigestStatus = 'ok' | 'retry' | 'fail';

export type DigestRow = {
  job: string;
  owner: string | null;
  runs: number;
  retries: number;
  lastStatus: DigestStatus;
  lastError: string | null;
  firstTime: string;
  lastTime: string;
};

export type NightDigest = {
  rows: DigestRow[];
  badLines: number;
};

// readNight(runsDir, night) returns null when the night's file does not exist.
export type ReadNight = (runsDir: string, night: string) => NightDigest | null;
