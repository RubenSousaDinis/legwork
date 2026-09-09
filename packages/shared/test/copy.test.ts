import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  claimSentence,
  trustModelSentence,
  uniquenessClause,
  verifiedBannerSub,
} from '../src/constants.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');

describe('credential-selected copy', () => {
  it('orbCopyIsByteIdenticalToToday', () => {
    expect(uniquenessClause('orb')).toBe('one account per person');
    expect(verifiedBannerSub('orb')).toBe('· World ID · one account per person');
    expect(claimSentence('orb')).toBe(
      'Marketplaces already let agents hire humans. Legwork is the first where every worker is one verified human, every payment is escrowed onchain and released on proof, every hiring agent is accountable, and the documented abuse classes are refused at the API.',
    );
    expect(trustModelSentence('orb')).toBe(
      "Verification proves a worker is a live, unique person — not that they are honest or competent. Escrow bounds the agent's loss to one task, and a per-agent daily cap bounds it to one day. Screening is a cost floor, not a cure. Legwork's guarantee is bounded, attributable work: an agent never pays for nothing, a worker never works for nothing, and every task leaves a record both sides can read.",
    );
  });

  it('selfieCopyNeverClaimsUniqueness', () => {
    const texts = [
      uniquenessClause('selfie'),
      verifiedBannerSub('selfie'),
      claimSentence('selfie'),
      trustModelSentence('selfie'),
    ];
    for (const text of texts) {
      expect(text).not.toContain('one account per person');
      expect(text).not.toContain('one verified human');
      expect(text).not.toMatch(/\bunique\b/);
      expect(text).toMatch(/live|camera/i);
    }
    expect(uniquenessClause('selfie')).toBe('a live person, camera-checked');
    expect(verifiedBannerSub('selfie')).toBe('· World ID · a live person, camera-checked');
    expect(claimSentence('selfie')).toContain('every worker is a camera-checked live human');
    expect(trustModelSentence('selfie')).toContain('a live person');
  });

  it('noHardCodedSelfieOutsideShared', () => {
    const dirs = [
      join(ROOT, 'apps/miniapp/app'),
      join(ROOT, 'apps/miniapp/components'),
      join(ROOT, 'apps/dashboard/app'),
    ];
    const hits: string[] = [];
    for (const dir of dirs) {
      for (const file of walkSource(dir)) {
        const src = readFileSync(file, 'utf8');
        for (const match of src.matchAll(/'([^']*selfie[^']*)'/g)) {
          const inner = match[1]!;
          const around = src.slice(Math.max(0, match.index! - 24), match.index! + match[0].length + 24);
          if (inner === 'selfie' && isLevelToken(around)) continue;
          hits.push(`${relative(ROOT, file)}: '${inner}'`);
        }
      }
    }
    expect(hits, `rendered or hard-coded 'selfie' outside shared:\n${hits.join('\n')}`).toEqual([]);
  });
});

function walkSource(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.next') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walkSource(p));
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\./.test(name)) out.push(p);
  }
  return out;
}

/** Type unions and control-flow on the level token, never a rendered sentence. */
function isLevelToken(around: string): boolean {
  return (
    /'selfie'\s*\|\s*'orb'/.test(around) ||
    /'orb'\s*\|\s*'selfie'/.test(around) ||
    /={2,3}\s*'selfie'/.test(around) ||
    /!==\s*'selfie'/.test(around)
  );
}
