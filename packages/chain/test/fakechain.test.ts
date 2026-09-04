import { FakeChain } from '../src/fake.js';
import { LIFECYCLE, lifecycleSuite } from './fixtures/lifecycle.js';

/**
 * The whole escrow lifecycle against the in-memory chain. The scenarios themselves live in
 * `fixtures/lifecycle.ts` so T-36 can point them at anvil without copying a line.
 */
lifecycleSuite(() => {
  const chain = new FakeChain({ relayer: LIFECYCLE.relayer, treasury: LIFECYCLE.treasury });
  chain.mintUsdc(LIFECYCLE.relayer, LIFECYCLE.relayerFloat);
  chain.setWorker(LIFECYCLE.worker1, {
    nullifier: LIFECYCLE.nullifier1,
    seeded: false,
    area: LIFECYCLE.area,
    taskTypes: LIFECYCLE.taskTypes,
  });
  chain.setWorker(LIFECYCLE.worker2, {
    nullifier: LIFECYCLE.nullifier2,
    seeded: false,
    area: LIFECYCLE.area,
    taskTypes: LIFECYCLE.taskTypes,
  });
  chain.setWorker(LIFECYCLE.seededWorker, {
    nullifier: LIFECYCLE.nullifierSeeded,
    seeded: true,
    area: LIFECYCLE.area,
    taskTypes: LIFECYCLE.taskTypes,
  });
  chain.setAgentIdentity(LIFECYCLE.agentId, LIFECYCLE.buyer, LIFECYCLE.buyer);
  return chain;
});
