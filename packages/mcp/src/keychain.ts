/**
 * Where a buyer token lives between `hire_human` and `approve_task`.
 *
 * A buyer token is the only thing standing between a stranger and someone else's escrow, so
 * the file it sits in is `0600` inside a `0700` directory and is replaced by an atomic rename
 * — a half-written token file would lock a buyer out of their own task with no way back.
 */
import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

export interface TokenStore {
  get(taskId: string): Promise<string | undefined>;
  set(taskId: string, token: string): Promise<void>;
}

export const DEFAULT_TOKEN_PATH = join(homedir(), '.legwork', 'tokens.json');

const DIR_MODE = 0o700;
const FILE_MODE = 0o600;

/** For tests and for the hosted server, which never has a token to keep. */
export class MemoryTokenStore implements TokenStore {
  private readonly tokens = new Map<string, string>();

  constructor(initial?: Record<string, string>) {
    for (const [taskId, token] of Object.entries(initial ?? {})) this.tokens.set(taskId, token);
  }

  async get(taskId: string): Promise<string | undefined> {
    return this.tokens.get(taskId);
  }

  async set(taskId: string, token: string): Promise<void> {
    this.tokens.set(taskId, token);
  }
}

export class FileTokenStore implements TokenStore {
  readonly path: string;
  /**
   * Writes are chained rather than run side by side. Two concurrent `set` calls would each
   * read the same file, add their own key and rename over each other — the second would
   * silently drop the first token, and the buyer would find out at approve time.
   */
  private queue: Promise<void> = Promise.resolve();

  constructor(path: string = DEFAULT_TOKEN_PATH) {
    this.path = path;
  }

  private async readAll(): Promise<Record<string, string>> {
    try {
      const raw = await readFile(this.path, 'utf8');
      const parsed: unknown = JSON.parse(raw);
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
      const out: Record<string, string> = {};
      for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
        if (typeof value === 'string') out[key] = value;
      }
      return out;
    } catch {
      // No file yet, or a file we cannot read as a token map: an empty map is the honest
      // answer, and the next `set` rewrites it.
      return {};
    }
  }

  async get(taskId: string): Promise<string | undefined> {
    return (await this.readAll())[taskId];
  }

  async set(taskId: string, token: string): Promise<void> {
    const next = this.queue.then(async () => {
      const dir = dirname(this.path);
      await mkdir(dir, { recursive: true, mode: DIR_MODE });
      await chmod(dir, DIR_MODE).catch(() => undefined);

      const tokens = await this.readAll();
      tokens[taskId] = token;

      const temp = `${this.path}.${process.pid}.${Date.now()}.tmp`;
      await writeFile(temp, `${JSON.stringify(tokens, null, 2)}\n`, { mode: FILE_MODE });
      await chmod(temp, FILE_MODE);
      await rename(temp, this.path);
    });
    // Keep the chain alive after a failure, or every later write inherits this rejection.
    this.queue = next.catch(() => undefined);
    return next;
  }
}
