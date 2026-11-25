import {devlog} from '../content';
import {Footer} from './Footer';
import {SubHeader} from './SubHeader';

function fmt(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString('en-GB', {day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC'});
}

export function DevLogPage() {
  return (
    <div className="bg-page text-ink">
      <SubHeader here="/devlog" />
      <main className="mx-auto max-w-[760px] px-[clamp(20px,2.6vw,40px)] py-[clamp(32px,6vh,72px)]">
        <div className="rule mb-[clamp(24px,4vh,40px)] flex items-baseline justify-between pt-3">
          <span className="pixel text-ui">Dev log</span>
          <span className="text-ui text-mute">building in the open</span>
        </div>
        <h1 className="pixel text-section mb-3 max-w-[20ch]">What got built, by the day</h1>
        <p className="mb-[clamp(28px,5vh,56px)] max-w-[60ch] text-body text-mute">
          Short notes on what actually changed in the repo. Newest first. No roadmap theatre, just the work.
        </p>

        <ol className="grid gap-px bg-rule">
          {devlog.map((e) => (
            <li key={e.date} className="bg-page py-[clamp(20px,3vh,32px)]">
              <div className="mb-3 flex items-baseline gap-3">
                <time className="pixel text-ui" dateTime={e.date}>
                  {fmt(e.date)}
                </time>
                {e.tag ? <span className="text-tiny uppercase text-mute">{e.tag}</span> : null}
              </div>
              <h2 className="mb-3 text-body font-medium">{e.title}</h2>
              <div className="grid gap-3">
                {e.body.map((p, i) => (
                  <p key={i} className="max-w-[60ch] text-body text-mute">
                    {p}
                  </p>
                ))}
              </div>
            </li>
          ))}
        </ol>
      </main>
      <Footer />
    </div>
  );
}
