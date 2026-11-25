import type {ReactNode} from 'react';

/** Hairline window chrome for product mockups. Always carries the mockup tag. */
export function Window({
  title,
  tag = 'mockup · example data',
  children,
  className = '',
}: {
  title: string;
  tag?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`box overflow-hidden ${className}`}>
      <div className="flex items-center gap-3 border-b border-ink px-3 py-2">
        <span className="flex gap-1" aria-hidden>
          <i className="block h-[7px] w-[7px] bg-ink" />
          <i className="block h-[7px] w-[7px] border border-ink" />
          <i className="block h-[7px] w-[7px] border border-ink" />
        </span>
        <span className="text-tiny uppercase">{title}</span>
        <span className="ml-auto text-tiny uppercase text-mute">{tag}</span>
      </div>
      {children}
    </div>
  );
}
