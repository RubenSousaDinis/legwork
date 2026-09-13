import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../lib/api';
import { IDKIT_RESULT_FIXTURE } from './fixtures';

/**
 * The real widget's two failure paths, in the order IDKit actually runs them:
 * `handleVerify` throws after `POST /idkit/verify` refuses, then `onError` fires
 * `generic_error` with no debug report. That second call used to replace the API
 * reason on screen and trip Next.js 16's console.error overlay.
 */
vi.mock('@worldcoin/idkit', () => ({
  IDKitRequestWidget: (props: {
    handleVerify?: (result: unknown) => Promise<void> | void;
    onError?: (code: unknown, debugReport?: unknown) => void;
    onSuccess: (result: unknown) => Promise<void> | void;
  }) => (
    <>
      <button
        onClick={() => props.onError?.('generic_error')}
        type="button"
      >
        widget-error
      </button>
      <button
        onClick={async () => {
          try {
            await props.handleVerify?.(IDKIT_RESULT_FIXTURE);
          } catch {
            props.onError?.('generic_error');
            return;
          }
          await props.onSuccess(IDKIT_RESULT_FIXTURE);
        }}
        type="button"
      >
        complete-idkit
      </button>
    </>
  ),
}));

const { RP_CONTEXT } = await import('../mocks/handlers');
const { IdkitFailure, IdkitVerify } = await import('../lib/worldid');

const rpContext = RP_CONTEXT;

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('IdkitVerify', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  it('widgetGenericErrorDoesNotConsoleError', () => {
    const onFailed = vi.fn();
    render(
      <IdkitVerify
        level="selfie"
        onFailed={onFailed}
        onOpenChange={() => undefined}
        onVerified={() => undefined}
        open
        rpContext={rpContext}
      />,
    );

    fireEvent.click(screen.getByText('widget-error'));

    expect(onFailed).toHaveBeenCalledTimes(1);
    const thrown = onFailed.mock.calls[0]?.[0];
    expect(thrown).toBeInstanceOf(IdkitFailure);
    expect((thrown as InstanceType<typeof IdkitFailure>).code).toBe('generic_error');
    expect(console.error).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledWith(
      '[idkit] verification failed',
      'generic_error',
      undefined,
    );
  });

  it('hostVerifyFailureIsNotReplacedByGenericError', async () => {
    const refused = new ApiError(400, { error: 'invalid_request', reason: 'environment_mismatch' });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(refused.body), { status: 400 }),
    );

    const onFailed = vi.fn();
    render(
      <IdkitVerify
        level="selfie"
        onFailed={onFailed}
        onOpenChange={() => undefined}
        onVerified={() => undefined}
        open
        rpContext={rpContext}
      />,
    );

    fireEvent.click(screen.getByText('complete-idkit'));

    await waitFor(() => expect(onFailed).toHaveBeenCalledTimes(1));
    expect(onFailed.mock.calls[0]?.[0]).toBeInstanceOf(ApiError);
    expect((onFailed.mock.calls[0]?.[0] as ApiError).status).toBe(400);
    expect(console.error).not.toHaveBeenCalled();
  });
});
