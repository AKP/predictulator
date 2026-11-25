import {CreateMock} from './mock/CreateMock';
import {LifecycleMock} from './mock/LifecycleMock';
import {PortfolioMock} from './mock/PortfolioMock';
import {TerminalMock} from './mock/TerminalMock';
import {TradeMock} from './mock/TradeMock';
import {Section} from './Section';

export function Product() {
  return (
    <Section id="product" index="01" title="What it looks like to use" kicker="interactive mockups, real math, no live market">
      <p className="mb-8 max-w-[62ch] text-body">
        Five screens from the product, drawn as working mockups. The questions are examples. The arithmetic is not:
        every number is produced by the same functions the real pages and services call. Drag things.
      </p>

      <div className="grid gap-6">
        <TradeMock />
        <div className="grid gap-6 xl:grid-cols-2">
          <PortfolioMock />
          <LifecycleMock />
        </div>
        <div className="grid gap-6 xl:grid-cols-2">
          <CreateMock />
          <TerminalMock />
        </div>
      </div>
    </Section>
  );
}
