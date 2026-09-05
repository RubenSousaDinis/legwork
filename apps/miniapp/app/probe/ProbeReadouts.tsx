'use client';

import { useState, type ReactNode } from 'react';
import { Button } from '../../components/ui/Button';
import { Chip } from '../../components/ui/Chip';
import type { ProbeResults } from '../../lib/probeApi';

const NOT_RUN = 'not run yet';

/** Long values are cut for the phone; the operator expands them before copying. */
const TRUNCATE_OVER = 64;
const TRUNCATE_TO = 24;

export type ProbeReadoutsProps = {
  results: ProbeResults;
  /** Every handler is optional so the card grid renders on its own in a test. */
  onRunIdkit?: () => void;
  onFile?: (file: File | null) => void;
  onCameraDirectChange?: (checked: boolean) => void;
  onRunGeolocation?: () => void;
  onRunWalletAuth?: () => void;
  onCopyJson?: () => void;
  copyState?: 'idle' | 'copied' | 'failed';
  busy?: boolean;
  /** The IDKit widget, mounted by the page in the browser only. */
  widget?: ReactNode;
};

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </>
  );
}

function LongValue({ value }: { value: string }) {
  const [full, setFull] = useState(false);
  if (value.length <= TRUNCATE_OVER) return <span>{value}</span>;
  return (
    <span>
      {full ? value : `${value.slice(0, TRUNCATE_TO)}…`}{' '}
      <Button variant="ghost" onClick={() => setFull((v) => !v)}>
        {full ? 'show less' : 'show full'}
      </Button>
    </span>
  );
}

function Card({
  name,
  title,
  action,
  children,
}: {
  name: string;
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="lw-card" data-readout={name}>
      <div className="lw-section-label">{title}</div>
      {action}
      {children}
    </section>
  );
}

function scalar(value: unknown): string {
  if (typeof value === 'string') return value;
  return JSON.stringify(value) ?? String(value);
}

export function ProbeReadouts({
  results,
  onRunIdkit,
  onFile,
  onCameraDirectChange,
  onRunGeolocation,
  onRunWalletAuth,
  onCopyJson,
  copyState = 'idle',
  busy = false,
  widget,
}: ProbeReadoutsProps) {
  const { idkit, camera, geolocation, walletAuth, env } = results;

  return (
    <div className="lw-readouts">
      <Card
        name="idkit"
        title="IDKit"
        action={
          <div style={{ marginTop: 'var(--s-3)' }}>
            <Button variant="primary" full onClick={onRunIdkit} disabled={busy}>
              Run IDKit verify
            </Button>
            {widget}
          </div>
        }
      >
        {idkit === null ? (
          <p className="lw-placeholder">{NOT_RUN}</p>
        ) : (
          <dl className="lw-kv">
            <Row label="preset">{idkit.preset}</Row>
            <Row label="nonce">
              {idkit.rp_context ? <LongValue value={idkit.rp_context.nonce} /> : '—'}
            </Row>
            <Row label="expires_at">{idkit.rp_context ? idkit.rp_context.expires_at : '—'}</Row>
            {idkit.widget_result
              ? Object.entries(idkit.widget_result).map(([key, value]) => (
                  <Row key={key} label={key}>
                    <LongValue value={scalar(value)} />
                  </Row>
                ))
              : null}
            <Row label="verified">{idkit.api_response ? String(idkit.api_response.verified) : '—'}</Row>
            <Row label="nullifier">
              {idkit.api_response ? <LongValue value={idkit.api_response.nullifier} /> : '—'}
            </Row>
            <Row label="level">{idkit.api_response ? idkit.api_response.level : '—'}</Row>
            {idkit.error ? (
              <Row label="error">
                <span className="lw-error">{idkit.error}</span>
              </Row>
            ) : null}
          </dl>
        )}
      </Card>

      <Card
        name="camera"
        title="Camera"
        action={
          <label className="lw-file-label" data-hit="44" htmlFor="probe-camera">
            Take a photo
            <input
              accept="image/*"
              capture="environment"
              className="lw-file-input"
              data-hit="44"
              id="probe-camera"
              onChange={(event) => onFile?.(event.target.files?.[0] ?? null)}
              type="file"
            />
          </label>
        }
      >
        {camera === null ? (
          <p className="lw-placeholder">{NOT_RUN}</p>
        ) : (
          <dl className="lw-kv">
            <Row label="name">
              <LongValue value={camera.name} />
            </Row>
            <Row label="size">{camera.size}</Row>
            <Row label="type">{camera.type}</Row>
            <Row label="lastModified">{camera.lastModified}</Row>
          </dl>
        )}
        <label className="lw-checkbox" data-hit="44">
          <input
            checked={camera?.camera_opened_directly ?? false}
            data-hit="44"
            onChange={(event) => onCameraDirectChange?.(event.target.checked)}
            type="checkbox"
          />
          the camera opened directly (not the gallery)
        </label>
      </Card>

      <Card
        name="geolocation"
        title="Geolocation"
        action={
          <div style={{ marginTop: 'var(--s-3)' }}>
            <Button variant="ghost" full onClick={onRunGeolocation}>
              Get a fix
            </Button>
          </div>
        }
      >
        {geolocation === null ? (
          <p className="lw-placeholder">{NOT_RUN}</p>
        ) : geolocation.ok ? (
          <dl className="lw-kv">
            <Row label="lat">{geolocation.lat}</Row>
            <Row label="lon">{geolocation.lon}</Row>
            <Row label="accuracy_m">{geolocation.accuracy_m}</Row>
            <Row label="time_to_fix_ms">{geolocation.time_to_fix_ms}</Row>
          </dl>
        ) : (
          <dl className="lw-kv">
            <Row label="code">
              <span className="lw-error">{geolocation.code}</span>
            </Row>
            <Row label="message">
              <span className="lw-error">{geolocation.message}</span>
            </Row>
          </dl>
        )}
        {geolocation?.ok ? (
          <p className="lw-placeholder">rounded to 3 decimals — the exact fix stays on the phone</p>
        ) : null}
      </Card>

      <Card
        name="walletAuth"
        title="walletAuth"
        action={
          <div style={{ marginTop: 'var(--s-3)' }}>
            <Button variant="ghost" full onClick={onRunWalletAuth}>
              Run walletAuth
            </Button>
          </div>
        }
      >
        {walletAuth === null ? (
          <p className="lw-placeholder">{NOT_RUN}</p>
        ) : walletAuth.ok ? (
          <dl className="lw-kv">
            <Row label="executedWith">{walletAuth.executedWith}</Row>
            <Row label="address">
              <LongValue value={walletAuth.address} />
            </Row>
            <Row label="message">{walletAuth.message}</Row>
            <Row label="signature">{walletAuth.signature_preview}</Row>
          </dl>
        ) : (
          <p className="lw-error">{walletAuth.error}</p>
        )}
      </Card>

      <section className="lw-card" data-readout-env="env">
        <div className="lw-section-label">Environment</div>
        {env === null ? (
          <p className="lw-placeholder">{NOT_RUN}</p>
        ) : (
          <dl className="lw-kv">
            <Row label="MiniKit">{String(env.minikit_installed)}</Row>
            <Row label="userAgent">
              <LongValue value={env.user_agent} />
            </Row>
            <Row label="viewport">{env.viewport}</Row>
            <Row label="level_env">
              <Chip tone="neutral">{env.level_env}</Chip>
            </Row>
          </dl>
        )}
      </section>

      <section className="lw-card" data-readout-json="json">
        <div className="lw-section-label">JSON</div>
        <p style={{ marginTop: 'var(--s-3)' }}>
          Paste into docs/spikes/RESULTS.md §S2 and FEEDBACK-WORLD.md §3 (payload shape + exact
          level string).
        </p>
        <pre className="lw-json">{JSON.stringify(results, null, 2)}</pre>
        <div style={{ marginTop: 'var(--s-3)' }}>
          <Button variant="primary" full onClick={onCopyJson}>
            {copyState === 'copied' ? 'Copied ✓' : 'Copy JSON'}
          </Button>
        </div>
        {copyState === 'failed' ? (
          <label className="lw-checkbox">
            <span className="lw-placeholder">clipboard blocked — select and copy:</span>
          </label>
        ) : null}
        {copyState === 'failed' ? (
          <textarea
            className="lw-json"
            data-hit="44"
            readOnly
            rows={8}
            value={JSON.stringify(results, null, 2)}
          />
        ) : null}
      </section>
    </div>
  );
}
