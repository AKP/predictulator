import {stats} from '../content';

export function Stats() {
  return (
    <div className="rule mx-[clamp(20px,2.6vw,40px)] grid grid-cols-2 gap-x-6 gap-y-8 pt-8 md:grid-cols-4">
      {stats.map((s) => (
        <div key={s.label}>
          <div className="pixel text-[clamp(28px,3.4vw,52px)] leading-none">{s.value}</div>
          <div className="mt-2 text-ui">{s.label}</div>
          <div className="mt-1 text-tiny text-mute">{s.note}</div>
        </div>
      ))}
    </div>
  );
}
