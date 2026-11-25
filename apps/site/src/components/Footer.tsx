import {links} from '../content';
import {Mark} from './Mark';

export function Footer() {
  return (
    <footer className="rule mx-[clamp(20px,2.6vw,40px)] mb-[clamp(24px,4vh,48px)] grid gap-8 pt-8 md:grid-cols-3">
      <div>
        <div className="flex items-center gap-3">
          <Mark />
          <span className="pixel text-ui">Predictulator</span>
        </div>
        <p className="mt-4 max-w-[36ch] text-tiny text-mute">
          Prediction markets on Solana, built as a client over the Percolator risk engine. Apache-2.0. Not affiliated
          with or endorsed by Anatoly Yakovenko, Solana Labs, or the Solana Foundation.
        </p>
        <p className="mt-3 max-w-[36ch] text-tiny text-mute">
          A{' '}
          <a className="text-ink underline-offset-4 hover:underline" href={links.twitter} target="_blank" rel="noreferrer">
            Doran Labs
          </a>{' '}
          project. Doran Labs is built by{' '}
          <a className="text-ink underline-offset-4 hover:underline" href={links.builder} target="_blank" rel="noreferrer">
            @DEXWatch
          </a>
          .
        </p>
      </div>
      <div className="text-ui">
        <div className="text-tiny uppercase text-mute">Links</div>
        <ul className="mt-3 space-y-2">
          <li>
            <a className="underline-offset-4 hover:underline" href="/devlog">
              dev log
            </a>
          </li>
          <li>
            <a className="underline-offset-4 hover:underline" href="/security">
              security review
            </a>
          </li>
          <li>
            <a className="underline-offset-4 hover:underline" href={links.github} target="_blank" rel="noreferrer">
              github.com/AKP/predictulator
            </a>
          </li>
          <li>
            <a className="underline-offset-4 hover:underline" href={links.twitter} target="_blank" rel="noreferrer">
              x.com/DoranLabs
            </a>
          </li>
          <li>
            <a className="underline-offset-4 hover:underline" href={links.repo} target="_blank" rel="noreferrer">
              percolator, the engine
            </a>
          </li>
          <li>
            <a className="underline-offset-4 hover:underline" href={links.program} target="_blank" rel="noreferrer">
              percolator-prog, the program
            </a>
          </li>
        </ul>
      </div>
      <div className="text-ui">
        <div className="text-tiny uppercase text-mute">Status</div>
        <ul className="mt-3 space-y-2 text-mute">
          <li>Devnet only. Test tokens only.</li>
          <li>Unaudited, as is the engine.</li>
          <li>Not run against a live market yet.</li>
        </ul>
      </div>
    </footer>
  );
}
