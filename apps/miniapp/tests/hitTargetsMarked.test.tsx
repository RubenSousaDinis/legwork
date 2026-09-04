import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProbeReadouts } from '../app/probe/ProbeReadouts';
import { Button } from '../components/ui/Button';
import { Chip } from '../components/ui/Chip';
import { MonoTag } from '../components/ui/MonoTag';
import { StatusBadge } from '../components/ui/StatusBadge';
import { VerifiedChip } from '../components/ui/VerifiedChip';
import { emptyResults } from '../lib/probeApi';

/** Phone floor: nothing tappable is smaller than 44 px, and the marker attribute proves it. */
const TAPPABLE = 'button, a, input[type=file]';

function assertMarked(container: HTMLElement) {
  const nodes = Array.from(container.querySelectorAll(TAPPABLE));
  expect(nodes.length).toBeGreaterThan(0);
  for (const node of nodes) {
    expect(node.getAttribute('data-hit')).toBe('44');
  }
}

describe('primitives', () => {
  it('hitTargetsMarked', () => {
    const primitives = render(
      <div>
        <Button variant="primary">Claim</Button>
        <Button variant="ghost" size="lg" full>
          Submit
        </Button>
        <Button variant="verified" disabled>
          Released
        </Button>
        <Chip tone="verified">sandbox World ID</Chip>
        <Chip tone="seeded" floor={20}>
          seeded
        </Chip>
        <MonoTag>photo-of</MonoTag>
        <StatusBadge status="released" />
        <StatusBadge status="refused" size="sm" />
        <VerifiedChip state={{ status: 'unverified' }} level="orb" />
        <VerifiedChip
          state={{
            status: 'verified',
            nullifier: '0x1f3e',
            level: 'orb',
            mode: 'idkit',
            worker: '0x00000000000000000000000000000000000f0417',
            registered: true,
          }}
          level="selfie"
        />
      </div>,
    );
    assertMarked(primitives.container);

    const probe = render(<ProbeReadouts results={emptyResults('orb')} />);
    assertMarked(probe.container);

    const fileInputs = probe.container.querySelectorAll('input[type=file]');
    expect(fileInputs.length).toBe(1);
    expect(fileInputs[0]?.getAttribute('capture')).toBe('environment');
    expect(fileInputs[0]?.getAttribute('accept')).toBe('image/*');

    // The visible target is the label wrapping the (visually hidden) file input.
    const fileLabel = fileInputs[0]?.closest('label');
    expect(fileLabel?.getAttribute('data-hit')).toBe('44');
  });
});
