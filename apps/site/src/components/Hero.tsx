import {ctas, headline, lede, media} from '../content';
import {useFitText} from '../hooks/useFitText';
import {ScanCat} from './ScanCat';

export function Hero() {
  const title = useFitText<HTMLHeadingElement>();
  return (
    <div className="relative flex min-h-[100svh] flex-col overflow-hidden">
      {/* Desktop: the cat owns the right 60%, under the nav. Phone: a square between headline and copy. */}
      <ScanCat
        video={media.video}
        poster={media.poster}
        className="scan-fade order-2 aspect-square w-full md:absolute md:top-[11vh] md:right-0 md:bottom-0 md:aspect-auto md:w-[60%]"
      />

      <main className="contents md:relative md:z-10 md:flex md:flex-1 md:flex-col md:px-[clamp(20px,2.6vw,40px)] md:pt-[17vh] md:pb-[12vh]">
        <div className="order-1 w-full px-[20px] pt-[9vh] pb-6 md:w-[38%] md:p-0">
          <h1 ref={title} className="pixel inline-block whitespace-nowrap text-hero rise">
            {headline[0]}
            <br />
            {headline[1]}
          </h1>
        </div>

        <div className="order-3 px-[20px] pt-6 pb-[8vh] md:mt-auto md:p-0">
          <p className="max-w-[40ch] text-lede rise [animation-delay:120ms]">{lede}</p>
          <div className="mt-[clamp(28px,5vh,52px)] flex items-center gap-[clamp(18px,1.6vw,26px)] rise [animation-delay:220ms]">
            <a
              href={ctas.primary.href}
              className="inline-flex h-[clamp(40px,4.4vh,46px)] items-center bg-ink px-[clamp(18px,1.6vw,24px)] text-ui text-page transition-opacity hover:opacity-85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              {ctas.primary.label}
            </a>
            <a href={ctas.secondary.href} className="group inline-flex items-center gap-2 text-ui">
              {ctas.secondary.label}
              <svg viewBox="0 0 6 10" className="h-[0.8em] w-auto transition-transform group-hover:translate-x-0.5" aria-hidden>
                <path d="M1 1l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.4" />
              </svg>
            </a>
          </div>
          <p className="mt-6 max-w-[40ch] text-tiny text-mute rise [animation-delay:320ms]">
            Devnet only. Not audited. Test tokens only. The engine underneath is itself an unaudited research project.
          </p>
        </div>
      </main>
    </div>
  );
}
