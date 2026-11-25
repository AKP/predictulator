import type {ReactNode} from 'react';

export function Section({
  id,
  index,
  title,
  kicker,
  children,
  className = '',
}: {
  id: string;
  index: string;
  title: string;
  kicker?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section id={id} className={`scroll-mt-16 px-[clamp(20px,2.6vw,40px)] py-[clamp(48px,8vh,96px)] ${className}`}>
      <div className="rule mb-[clamp(20px,3vh,32px)] flex items-baseline justify-between pt-3">
        <span className="pixel text-ui">{index}</span>
        {kicker && <span className="text-ui text-mute">{kicker}</span>}
      </div>
      <h2 className="pixel text-section mb-[clamp(20px,3vh,36px)] max-w-[22ch]">{title}</h2>
      {children}
    </section>
  );
}

export function Eyebrow({children}: {children: ReactNode}) {
  return <div className="text-tiny mb-2 uppercase text-mute">{children}</div>;
}
