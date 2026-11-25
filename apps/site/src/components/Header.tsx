import {useState} from 'react';
import {brand, links, nav} from '../content';
import {Mark} from './Mark';

function GitHubIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-[1.05em] w-[1.05em] fill-current" aria-hidden>
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-[1em] w-[1em] fill-current" aria-hidden>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

export function Header() {
  const [open, setOpen] = useState(false);
  return (
    <header className="relative z-20 flex items-center justify-between px-[clamp(20px,2.6vw,40px)] pt-[clamp(20px,3.8vh,40px)]">
      <a href="#" className="flex items-center gap-3" aria-label={`${brand} home`}>
        <Mark />
        <span className="pixel hidden text-ui sm:inline">{brand}</span>
      </a>
      <nav aria-label="Main">
        <ul className="hidden items-center gap-[clamp(20px,2.4vw,36px)] text-ui md:flex">
          {nav.map((l) => (
            <li key={l.href}>
              <a href={l.href} className="underline-offset-4 hover:underline">
                {l.label}
              </a>
            </li>
          ))}
          <li>
            <a href="/devlog" className="underline-offset-4 hover:underline">
              Dev log
            </a>
          </li>
          <li>
            <a href="/security" className="underline-offset-4 hover:underline">
              Security
            </a>
          </li>
          <li>
            <a href={links.github} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 underline-offset-4 hover:underline">
              <GitHubIcon />
              GitHub
            </a>
          </li>
          <li>
            <a href={links.twitter} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 underline-offset-4 hover:underline" aria-label="Doran Labs on X">
              <XIcon />
              @DoranLabs
            </a>
          </li>
        </ul>
        <button
          type="button"
          className="text-ui md:hidden"
          aria-expanded={open}
          aria-controls="mobile-nav"
          onClick={() => setOpen((o) => !o)}
        >
          {open ? 'Close' : 'Menu'}
        </button>
        {open && (
          <ul
            id="mobile-nav"
            className="absolute inset-x-[20px] top-full mt-3 flex flex-col gap-4 bg-ink p-5 text-ui text-page md:hidden"
          >
            {nav.map((l) => (
              <li key={l.href}>
                <a href={l.href} onClick={() => setOpen(false)}>
                  {l.label}
                </a>
              </li>
            ))}
            <li>
              <a href="/devlog" onClick={() => setOpen(false)}>
                Dev log
              </a>
            </li>
            <li>
              <a href="/security" onClick={() => setOpen(false)}>
                Security
              </a>
            </li>
            <li>
              <a href={links.github} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2">
                <GitHubIcon />
                GitHub
              </a>
            </li>
            <li>
              <a href={links.twitter} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2">
                <XIcon />
                @DoranLabs
              </a>
            </li>
          </ul>
        )}
      </nav>
    </header>
  );
}
