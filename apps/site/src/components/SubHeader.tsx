import {brand} from '../content';
import {Mark} from './Mark';

/** Minimal header for standalone pages (security, dev log). Logo returns home. */
export function SubHeader({here}: {here: string}) {
  const tabs = [
    {label: 'Home', href: '/'},
    {label: 'Dev log', href: '/devlog'},
    {label: 'Security', href: '/security'},
  ];
  return (
    <header className="relative z-20 flex items-center justify-between px-[clamp(20px,2.6vw,40px)] pt-[clamp(20px,3.8vh,40px)]">
      <a href="/" className="flex items-center gap-3" aria-label={`${brand} home`}>
        <Mark />
        <span className="pixel text-ui">{brand}</span>
      </a>
      <nav aria-label="Pages">
        <ul className="flex items-center gap-[clamp(16px,2.4vw,36px)] text-ui">
          {tabs.map((t) => (
            <li key={t.href}>
              <a
                href={t.href}
                aria-current={t.href === here ? 'page' : undefined}
                className={
                  t.href === here
                    ? 'underline underline-offset-4'
                    : 'text-mute underline-offset-4 hover:text-ink hover:underline'
                }
              >
                {t.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
}
