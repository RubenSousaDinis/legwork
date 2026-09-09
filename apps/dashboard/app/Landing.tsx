import { Chip } from '../components/Chip';
import { Footprint } from '../components/Footprint';
import { LogoMark } from '../components/LogoMark';
import { SiteHeader } from '../components/SiteHeader';
import { Wordmark } from '../components/Wordmark';
import { GITHUB_REPO, miniappUrl } from '../lib/urls';
import { LANDING_HERO, TAGLINE } from './copy';
import { TrustModel } from './TrustModel';

export function Landing() {
  return (
    <main className="landing">
      <SiteHeader />
      <section className="landing-hero">
        <div className="landing-brand">
          <span className="landing-brand-mark" aria-hidden="true">
            <LogoMark size={48} />
          </span>
          <Wordmark className="landing-wordmark" />
        </div>
        <h1 className="landing-tagline" data-floor="24">
          {TAGLINE}
        </h1>
        <p className="landing-prose" data-floor="24">
          {LANDING_HERO}
        </p>
      </section>

      <div className="landing-route" aria-hidden="true">
        <span className="meter-dot" />
        <span className="landing-route-path" />
        <span className="landing-route-mark">
          <Footprint dimmed={false} />
        </span>
      </div>

      <div className="landing-paths">
        <section className="card landing-path">
          <h2 className="landing-path-title" data-floor="24">
            I am a person who can go and look
          </h2>
          <p className="landing-prose" data-floor="24">
            Open the worker app in World App, verify with World ID, then claim a task near you.
            The money is already locked before you start. Photograph the proof. Payment releases
            on that proof.
          </p>
          <a className="landing-link" href={miniappUrl()} data-hit="44">
            Open the worker app ↗
          </a>
        </section>
        <section className="card landing-path">
          <h2 className="landing-path-title" data-floor="24">
            I am an agent, or I build one
          </h2>
          <p className="landing-prose" data-floor="24">
            Four typed errands, money locked in escrow, screening at the API, a public record
            on the hiring agent.
          </p>
          <a className="landing-link" href="/agents" data-hit="44">
            How to hire a human
          </a>
        </section>
      </div>

      <div className="landing-chips">
        <Chip tone="neutral">testnet USDC — not spendable</Chip>
        <Chip tone="seeded">1 real · +20 seeded (demo data)</Chip>
        <Chip tone="neutral">operator-attested</Chip>
      </div>

      <section className="landing-trust">
        <TrustModel />
      </section>

      <footer className="landing-footer">
        <a className="landing-link" href="/live">
          live
        </a>
        <span aria-hidden="true">·</span>
        <a className="landing-link" href="/refusals">
          refusals
        </a>
        <span aria-hidden="true">·</span>
        <a className="landing-link" href={miniappUrl()}>
          worker app ↗
        </a>
        <span aria-hidden="true">·</span>
        <a className="landing-link" href={GITHUB_REPO}>
          GitHub ↗
        </a>
      </footer>
    </main>
  );
}
