/**
 * What a price is quoted in, where the place is.
 *
 * A worker calling Joe's Pizza hears dollars, and one calling Curry 36 hears euros. The proof
 * schema takes any ISO-4217 code (T-60), and the worker brief carries the place's ISO-3166-1
 * alpha-2 country (T-63) — this is the one-line map between them, and the fallback when the
 * map has no answer is to ask the worker rather than to guess.
 */

/** ISO-3166-1 alpha-2 → ISO-4217. Absent means "ask the worker". */
export const CURRENCY_BY_COUNTRY: Readonly<Record<string, string>> = {
  PT: 'EUR', ES: 'EUR', FR: 'EUR', DE: 'EUR', IT: 'EUR', NL: 'EUR', BE: 'EUR', AT: 'EUR', IE: 'EUR', FI: 'EUR', GR: 'EUR',
  GB: 'GBP', US: 'USD', CA: 'CAD', AU: 'AUD', NZ: 'NZD', CH: 'CHF', SE: 'SEK', NO: 'NOK', DK: 'DKK', PL: 'PLN', CZ: 'CZK',
  JP: 'JPY', SG: 'SGD', KR: 'KRW', CN: 'CNY', HK: 'HKD', IN: 'INR', BR: 'BRL', AR: 'ARS', MX: 'MXN', ZA: 'ZAR', TR: 'TRY', AE: 'AED',
};

/** `CallConfirmProof.price.currency` in `packages/shared`: three capitals, nothing else. */
export const ISO_4217 = /^[A-Z]{3}$/;

/**
 * The code to price in, or `undefined` when this map cannot say — an absent country on the
 * brief and a country it does not list are the same answer, and both mean the screen asks.
 */
export function currencyForCountry(country: string | undefined): string | undefined {
  if (country === undefined) return undefined;
  return CURRENCY_BY_COUNTRY[country.toUpperCase()];
}
