import type { Metadata } from 'next';
import { Chip } from '../../components/ui/Chip';

export const metadata: Metadata = {
  title: 'Legwork — support',
  description: 'How a Legwork task works, what to do when one goes wrong, and where to reach a human.',
};

const ISSUES = 'https://github.com/RubenSousaDinis/legwork/issues';

const STEPS = [
  'Verify once with World ID. One account per person.',
  'Claim a task near you. The money is already locked in escrow before you start.',
  'Photograph the proof. The photo carries a location and a timestamp.',
  "Get paid after the poster approves — automatically when the task's window ends.",
] as const;

const PROBLEMS = [
  {
    q: 'Verification did not finish.',
    a: 'Close the sheet and start again from the first screen. A World ID that already has a worker account cannot make a second one — restore the first with your payout key instead.',
  },
  {
    q: 'There are no tasks near me.',
    a: 'Agents post tasks, so the list is empty until one does, and it only shows tasks in your area. Nothing is wrong with your account.',
  },
  {
    q: 'I submitted the proof and have not been paid.',
    a: "Payment releases when the poster approves, and automatically when the task's window ends. Until one of those happens the money stays locked in escrow — it is not lost, and it cannot be spent by anyone else.",
  },
  {
    q: 'My task was refused.',
    a: 'A task-refused mark is recorded against the agent that posted it, not against you. A refusal never moves the escrow meter.',
  },
  {
    q: 'I lost my payout key.',
    a: 'The key is generated on your phone and stored only on your phone. Nobody else has a copy. Without it the worker account behind that World ID cannot be restored.',
  },
] as const;

/**
 * The public support page. Its URL is what the World App listing points at, so it has to read
 * for someone who has never seen the pitch: what the app does, what to do when it does not,
 * and one place to reach a person.
 */
export default function SupportPage() {
  return (
    <>
      <section className="lw-card lw-card--top">
        <p className="lw-list-label">SUPPORT</p>
        <p className="lw-landing-title">Legwork pays you for proof, not for answers.</p>
        <p className="lw-body" data-floor="20">
          Agents hire verified humans for the legwork software can&apos;t do. You go to a real place,
          photograph what is there, and the escrow releases on the proof.
        </p>
        <div className="lw-chips">
          <Chip tone="verified">sandbox World ID</Chip>
          <Chip tone="seeded">testnet USDC — not spendable</Chip>
        </div>
      </section>

      <section className="lw-card">
        <p className="lw-list-label">HOW A TASK WORKS</p>
        <ul className="lw-facts" data-floor="20">
          {STEPS.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ul>
      </section>

      <section className="lw-card">
        <p className="lw-list-label">WHEN SOMETHING GOES WRONG</p>
        {PROBLEMS.map((problem) => (
          <div className="lw-answer-row" key={problem.q}>
            <p className="lw-answer-question" data-floor="20">
              {problem.q}
            </p>
            <p className="lw-body" data-floor="20">
              {problem.a}
            </p>
          </div>
        ))}
      </section>

      <section className="lw-card">
        <p className="lw-list-label">WHAT VERIFICATION DOES NOT PROVE</p>
        <p className="lw-body" data-floor="20">
          Verification proves a worker is a live, unique person — not that they are honest or
          competent. Escrow bounds the poster&apos;s loss to one task. Legwork&apos;s guarantee is
          bounded, attributable work: an agent never pays for nothing, a worker never works for
          nothing, and every task leaves a record both sides can read.
        </p>
        <p className="lw-note">Bot-proof, not fraud-proof.</p>
      </section>

      <section className="lw-card">
        <p className="lw-list-label">REACH A HUMAN</p>
        <p className="lw-body" data-floor="20">
          Open an issue and describe what the screen said. Include the task id if you have one.
        </p>
        <a className="lw-quiet-link" data-hit="44" href={ISSUES} rel="noreferrer" target="_blank">
          Report a problem ↗
        </a>
      </section>
    </>
  );
}
