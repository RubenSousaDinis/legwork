'use client';

import { useState } from 'react';
import { MIN_WITHDRAW_USDC, withdrawFeeOn } from '@legwork/shared';
import { Button } from '../../components/ui/Button';
import { Chip } from '../../components/ui/Chip';
import { ApiError, apiFetch } from '../../lib/api';
import { USDC_ADDRESS, USDC_CHAIN_ID, signWithdrawal } from '../../lib/workerKey';

/**
 * Moving earnings off the payout address, with Legwork paying the gas.
 *
 * The address this phone generated has never held any ETH, so it cannot send a transaction.
 * What it can do is sign: two EIP-3009 authorizations, built here on the phone by
 * `signWithdrawal` and handed to the API, which submits them and pays for the privilege by
 * keeping 2 % of the amount moved.
 *
 * **Nothing on this screen signs a field the API supplied.** The destination is what the
 * worker typed, the amount is what the worker typed, and the token, the chain and the fee
 * address are constants in `lib/workerKey.ts`. The API is never asked what to sign, because a
 * server that could answer that question could name itself as the recipient and empty the
 * address without a pixel on this screen looking wrong.
 *
 * Three steps, and the middle one exists on purpose: a worker sees the exact split before
 * they sign, and then sees the destination in full — all 42 characters, never an ellipsis —
 * before they confirm. A truncated address is how money goes to the wrong wallet.
 */

const BASESCAN_TX = 'https://sepolia.basescan.org/tx/';

export const WITHDRAW_HEADING = 'withdraw';
export const DESTINATION_LABEL = 'destination address';
export const AMOUNT_LABEL = 'amount (USDC)';
export const REVIEW = 'REVIEW';
export const CONFIRM = 'WITHDRAW';
export const BACK = 'BACK';
export const SIGNING = 'Signing on this phone…';
export const SENDING = 'Legwork is submitting it…';
export const CONFIRM_PROMPT = 'Sending to this address, in full:';
export const TESTNET_NOTE = 'testnet USDC on Base Sepolia — not spendable anywhere';
export const GAS_NOTE = 'Legwork pays the gas. You never need ETH.';
export const BAD_ADDRESS = 'A destination is 0x followed by 40 hex characters.';
export const NO_KEY = 'There is no payout key on this phone.';

/** Said with the number in it: a floor a worker cannot read is a refusal they cannot act on. */
export const BELOW_MINIMUM = `The smallest withdrawal is ${MIN_WITHDRAW_USDC.toFixed(2)} USDC. Under that, the 2 % fee does not cover what the transfer costs.`;

/** Bigint units to the figure a worker reads: two decimals, and more only when there are more. */
export function usdc(units: bigint): string {
  const whole = units / 1_000_000n;
  const fraction = (units % 1_000_000n).toString().padStart(6, '0').replace(/0+$/, '');
  return `${whole}.${fraction.padEnd(2, '0')}`;
}

/** The line the whole confirm step exists for: what the worker gets, and what Legwork keeps. */
export function splitLine(amountUnits: bigint): string {
  const fee = withdrawFeeOn(amountUnits);
  return `you receive ${usdc(amountUnits - fee)} · Legwork keeps ${usdc(fee)}`;
}

/**
 * The typed amount as integer units, or `null` if it is not an amount.
 *
 * Parsed digit by digit rather than through a `Number`: 6-decimal USDC and binary floating
 * point disagree about figures a worker types every day, and the disagreement is money.
 */
export function unitsFrom(text: string): bigint | null {
  const trimmed = text.trim();
  if (!/^\d+(\.\d{1,6})?$/.test(trimmed)) return null;
  const [whole = '0', fraction = ''] = trimmed.split('.');
  return BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, '0'));
}

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

/** What `POST /me/withdraw` answered. `fee_pending` is Legwork's problem, stated as one. */
type Withdrawn = {
  payout_tx: string;
  fee_tx: string | null;
  payout_usdc: number;
  fee_usdc: number;
  fee_pending?: true;
};

/** Every refusal the API can give, in words a worker can do something about. */
function refusalMessage(error: ApiError): string {
  const body = (error.body ?? {}) as { error?: string; reason?: string };
  if (error.status === 403) {
    return 'Those signatures are not this account\'s. Nothing was submitted.';
  }
  if (error.status === 409) return 'That withdrawal is already going through.';
  if (error.status === 503) return 'It did not go through and nothing moved. You can try again.';
  switch (body.reason) {
    case 'below_minimum':
      return BELOW_MINIMUM;
    case 'authorization_expired':
      return 'That request sat too long. Start it again.';
    case 'wrong_destination':
    case 'wrong_fee_recipient':
    case 'fee_mismatch':
      return 'The amounts did not add up and nothing was submitted. Start it again.';
    default:
      return 'Legwork could not submit that. Nothing moved.';
  }
}

type Step =
  | { name: 'form' }
  | { name: 'confirm' }
  | { name: 'signing' }
  | { name: 'sending' }
  | { name: 'done'; result: Withdrawn };

export function WithdrawForm() {
  const [destination, setDestination] = useState('');
  const [amount, setAmount] = useState('');
  const [step, setStep] = useState<Step>({ name: 'form' });
  const [error, setError] = useState<string | null>(null);

  const amountUnits = unitsFrom(amount);
  const feeUnits = amountUnits === null ? null : withdrawFeeOn(amountUnits);
  const busy = step.name === 'signing' || step.name === 'sending';

  function review(): void {
    setError(null);
    if (!ADDRESS_RE.test(destination.trim())) {
      setError(BAD_ADDRESS);
      return;
    }
    if (amountUnits === null || amountUnits <= 0n) {
      setError('Enter an amount to withdraw.');
      return;
    }
    if (amountUnits < BigInt(Math.round(MIN_WITHDRAW_USDC * 1_000_000))) {
      setError(BELOW_MINIMUM);
      return;
    }
    setStep({ name: 'confirm' });
  }

  async function confirm(): Promise<void> {
    if (amountUnits === null) return;
    setError(null);
    setStep({ name: 'signing' });
    try {
      // Built and signed here, from the two things the worker typed and the constants in
      // `workerKey.ts`. The API sees the result and was never consulted about it.
      const signed = await signWithdrawal(
        destination.trim(),
        amountUnits,
        USDC_CHAIN_ID,
        USDC_ADDRESS,
      );
      setStep({ name: 'sending' });
      const result = await apiFetch<Withdrawn>('/me/withdraw', {
        method: 'POST',
        body: JSON.stringify(signed),
      });
      setStep({ name: 'done', result });
    } catch (err) {
      setError(err instanceof ApiError ? refusalMessage(err) : (err as Error).message);
      setStep({ name: 'confirm' });
    }
  }

  if (step.name === 'done') {
    const { result } = step;
    return (
      <div className="lw-card lw-card--top" data-withdraw="done">
        <p className="lw-list-label">{WITHDRAW_HEADING}</p>
        <p className="lw-stat lw-stat--md" data-withdraw="sent" data-floor="20">
          {result.payout_usdc.toFixed(2)}
        </p>
        <p className="lw-meta lw-meta--top">
          <span>{TESTNET_NOTE}</span>
        </p>
        <dl className="lw-kv" data-withdraw="receipt">
          <dt>to</dt>
          <dd data-withdraw="destination">{destination.trim()}</dd>
          <dt>fee</dt>
          <dd>{result.fee_usdc.toFixed(2)}</dd>
        </dl>
        {result.fee_pending ? (
          // The one thing a worker must not be left guessing about: their money arrived, and
          // the leg that did not land is the one Legwork is owed.
          <p className="lw-note lw-note--top" data-withdraw="fee-pending">
            Your {result.payout_usdc.toFixed(2)} is on its way. Legwork&rsquo;s{' '}
            {result.fee_usdc.toFixed(2)} fee has not been taken yet and will be — you are not
            short by it.
          </p>
        ) : null}
        <p className="lw-chips lw-chips--stacked-top">
          <Chip tone="neutral" floor={20}>
            <a
              data-hit="44"
              href={`${BASESCAN_TX}${result.payout_tx}`}
              rel="noreferrer"
              target="_blank"
            >
              Basescan ↗
            </a>
          </Chip>
        </p>
      </div>
    );
  }

  return (
    <div className="lw-card lw-card--top" data-withdraw="form">
      <p className="lw-list-label">{WITHDRAW_HEADING}</p>

      <label className="lw-field" htmlFor="withdraw-destination">
        <span className="lw-list-label lw-list-label--flush">{DESTINATION_LABEL}</span>
        <input
          className="lw-input lw-input--full"
          data-hit="44"
          data-withdraw="destination-input"
          disabled={step.name !== 'form'}
          id="withdraw-destination"
          inputMode="text"
          onChange={(event) => setDestination(event.target.value)}
          spellCheck={false}
          type="text"
          value={destination}
        />
      </label>

      <label className="lw-field" htmlFor="withdraw-amount">
        <span className="lw-list-label lw-list-label--flush">{AMOUNT_LABEL}</span>
        <input
          className="lw-input lw-input--full"
          data-hit="44"
          data-withdraw="amount-input"
          disabled={step.name !== 'form'}
          id="withdraw-amount"
          inputMode="decimal"
          onChange={(event) => setAmount(event.target.value)}
          type="text"
          value={amount}
        />
      </label>

      {/* The split, live, before anything is signed and before the confirm step exists. */}
      {amountUnits !== null && amountUnits > 0n && feeUnits !== null ? (
        <p className="lw-meta lw-meta--top lw-meta--strong" data-withdraw="split" data-floor="20">
          {splitLine(amountUnits)}
        </p>
      ) : null}

      <p className="lw-meta lw-meta--top">
        <span>{TESTNET_NOTE}</span>
        <Chip tone="neutral" floor={20}>
          {GAS_NOTE}
        </Chip>
      </p>

      {step.name === 'form' ? (
        <p className="lw-actions lw-actions--top">
          <Button full onClick={review} size="lg" variant="primary">
            {REVIEW}
          </Button>
        </p>
      ) : (
        <>
          {/* All 42 characters, on their own line, in mono. Never an ellipsis: a truncated
              address is how money goes to a wallet nobody meant. */}
          <p className="lw-note lw-note--top" data-withdraw="confirm-prompt">
            {CONFIRM_PROMPT}
          </p>
          <p className="lw-address" data-withdraw="destination">
            {destination.trim()}
          </p>
          <p className="lw-actions lw-actions--top">
            <Button disabled={busy} full onClick={() => void confirm()} size="lg" variant="primary">
              {busy ? (step.name === 'signing' ? SIGNING : SENDING) : CONFIRM}
            </Button>
            <Button
              disabled={busy}
              full
              onClick={() => {
                setError(null);
                setStep({ name: 'form' });
              }}
              variant="ghost"
            >
              {BACK}
            </Button>
          </p>
        </>
      )}

      {error === null ? null : (
        <p className="lw-error-line" data-error="withdraw" data-floor="20" data-tone="refusal">
          {error}
        </p>
      )}
    </div>
  );
}
