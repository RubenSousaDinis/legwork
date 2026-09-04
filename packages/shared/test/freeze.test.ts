import { describe, expect, it } from 'vitest';
import {
  ABUSE_CLASSES,
  ABUSE_CLASS_ID,
  abuseClassById,
  bitmaskToTaskTypes,
  OUTCOME,
  refusalTag,
  TASK_STATE,
  TASK_TYPE_BIT,
  taskStateName,
  taskTypesToBitmask,
} from '../src/enums.js';
import {
  feeOn,
  fromUsdcUnits,
  PRICE_FLOOR_USDC,
  priceWithFee,
  toUsdcUnits,
} from '../src/constants.js';
import { CHAIN_ID, isDeployed, parseDeployment, PLACEHOLDER_DEPLOYMENT } from '../src/addresses.js';

// These mirror contracts/test/InterfaceFreeze.t.sol. Both sides must agree, and the point
// of duplicating them is that a change to one fails the other.

describe('task types', () => {
  it('keeps the on-chain bitmask', () => {
    expect(TASK_TYPE_BIT).toEqual({
      'verify-open': 1,
      'photo-of': 2,
      'call-confirm': 4,
      'compare-two': 8,
    });
  });

  it('round-trips a bitmask', () => {
    const types = ['verify-open', 'call-confirm'] as const;
    expect(taskTypesToBitmask(types)).toBe(5);
    expect(bitmaskToTaskTypes(5)).toEqual(['verify-open', 'call-confirm']);
    expect(bitmaskToTaskTypes(15)).toHaveLength(4);
  });
});

describe('task state', () => {
  it('keeps the Solidity ordinals', () => {
    expect(TASK_STATE).toEqual({
      None: 0, Open: 1, Claimed: 2, Submitted: 3,
      Released: 4, Refunded: 5, Disputed: 6, Resolved: 7,
    });
    expect(taskStateName(4)).toBe('Released');
    expect(() => taskStateName(99)).toThrow();
  });
});

describe('abuse classes', () => {
  it('has six, in id order, spelled once', () => {
    expect(ABUSE_CLASSES).toHaveLength(6);
    expect(ABUSE_CLASS_ID['credential fraud']).toBe(1);
    expect(ABUSE_CLASS_ID['referral fraud']).toBe(6);
    expect(abuseClassById(3)).toBe('automated reconnaissance');
    expect(() => abuseClassById(7)).toThrow();
  });

  it('builds the refusal tag from the same strings', () => {
    expect(refusalTag('referral fraud')).toBe('task-refused:referral fraud');
  });
});

describe('outcomes', () => {
  it('matches Outcomes.sol', () => {
    expect(OUTCOME).toEqual({ Paid: 1, ResolvedToWorker: 2, ResolvedToBuyer: 3 });
  });
});

describe('money', () => {
  it('charges the fee on top, never deducted', () => {
    const amount = toUsdcUnits(3.0);
    expect(amount).toBe(3_000_000n);
    expect(feeOn(amount)).toBe(450_000n);
    expect(priceWithFee(amount)).toBe(3_450_000n);
    // the worker's share is untouched by the fee
    expect(fromUsdcUnits(amount)).toBe(3.0);
    expect(fromUsdcUnits(priceWithFee(amount))).toBe(3.45);
    expect(fromUsdcUnits(feeOn(amount))).toBe(0.45);
  });

  it('holds the price floors', () => {
    expect(PRICE_FLOOR_USDC['verify-open']).toBe(3.0);
    expect(PRICE_FLOOR_USDC['photo-of']).toBe(3.0);
    expect(PRICE_FLOOR_USDC['call-confirm']).toBe(2.0);
    expect(PRICE_FLOOR_USDC['compare-two']).toBe(1.0);
  });

  it('rounds to whole USDC units', () => {
    expect(toUsdcUnits(3.45)).toBe(3_450_000n);
    expect(toUsdcUnits(0.1)).toBe(100_000n);
  });
});

describe('deployment record', () => {
  it('is not deployed until T-14 fills it', () => {
    expect(PLACEHOLDER_DEPLOYMENT.chainId).toBe(CHAIN_ID);
    expect(isDeployed(PLACEHOLDER_DEPLOYMENT)).toBe(false);
  });

  it('accepts a T-14 record and ignores unknown keys', () => {
    const d = parseDeployment({
      chainId: 84532,
      addresses: {
        workerRegistry: '0x1111111111111111111111111111111111111111',
        taskEscrow: '0x2222222222222222222222222222222222222222',
        reputation: '0x3333333333333333333333333333333333333333',
        abuseMark: '0x4444444444444444444444444444444444444444',
      },
      startBlock: 123,
      somethingT14AddedLater: true,
    });
    expect(isDeployed(d)).toBe(true);
    expect(d.startBlock).toBe(123);
  });

  it('refuses a record missing a contract', () => {
    expect(() => parseDeployment({ addresses: { workerRegistry: '0x1' } })).toThrow(/taskEscrow/);
  });
});
