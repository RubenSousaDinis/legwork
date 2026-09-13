import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { AnswerToggle, EMPTY_ANSWER } = await import('../../app/proof/AnswerToggle');
type AnswerState = import('../../app/proof/AnswerToggle').AnswerState;
const { currencyForCountry } = await import('../../lib/currency');

afterEach(cleanup);

describe('currency follows the place', () => {
  it('currencyFollowsThePlaceCountry', () => {
    expect(currencyForCountry('US')).toBe('USD');
    expect(currencyForCountry('DE')).toBe('EUR');
    expect(currencyForCountry('GB')).toBe('GBP');
    expect(currencyForCountry('SG')).toBe('SGD');
    expect(currencyForCountry('JP')).toBe('JPY');
    expect(currencyForCountry(undefined)).toBeUndefined();
    expect(currencyForCountry('XX')).toBeUndefined();
  });

  it('answerTogglePriceLabelNamesTheCurrency', () => {
    const onChange = vi.fn();
    const value: AnswerState = {
      ...EMPTY_ANSWER,
      template_id: 'price_of',
      called_at: '2026-09-11T10:00:00.000Z',
      answer: 'price',
    };
    render(
      <AnswerToggle country="GB" onChange={onChange} taskType="call-confirm" value={value} />,
    );

    expect(screen.getByText('amount (GBP)')).toBeTruthy();
    fireEvent.change(document.querySelector('[data-input="price"]') as HTMLInputElement, {
      target: { value: '12' },
    });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ price: { amount: 12, currency: 'GBP' } }),
    );
  });

  it('unknownCountryAsksForACode', () => {
    const onChange = vi.fn();
    const value: AnswerState = {
      ...EMPTY_ANSWER,
      template_id: 'price_of',
      called_at: '2026-09-11T10:00:00.000Z',
      answer: 'price',
    };
    render(<AnswerToggle onChange={onChange} taskType="call-confirm" value={value} />);

    expect(screen.getByText('amount')).toBeTruthy();
    expect(document.querySelector('[data-input="currency"]')).not.toBeNull();

    fireEvent.change(document.querySelector('[data-input="price"]') as HTMLInputElement, {
      target: { value: '12' },
    });
    expect(onChange.mock.calls.every((call) => call[0].price === undefined)).toBe(true);

    fireEvent.change(document.querySelector('[data-input="currency"]') as HTMLInputElement, {
      target: { value: 'chf' },
    });
    expect(
      (document.querySelector('[data-input="currency"]') as HTMLInputElement).value,
    ).toBe('CHF');
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ price: { amount: 12, currency: 'CHF' } }),
    );
  });
});
