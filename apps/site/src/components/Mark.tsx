/** Three rising pixel bars on a 9×8 grid: a probability climbing to one. */
export function Mark({className = 'h-[22px] w-auto'}: {className?: string}) {
  return (
    <svg viewBox="0 0 9 8" shapeRendering="crispEdges" className={className} aria-hidden>
      <path className="fill-ink" d="M0 5h2v3H0zM3 2h2v6H3zM6 0h2v8H6z" />
    </svg>
  );
}
