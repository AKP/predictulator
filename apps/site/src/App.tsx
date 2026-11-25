import {Api} from './components/Api';
import {Architecture} from './components/Architecture';
import {Charts} from './components/Charts';
import {Compare} from './components/Compare';
import {Containment} from './components/Containment';
import {DevLogPage} from './components/DevLogPage';
import {Footer} from './components/Footer';
import {Header} from './components/Header';
import {Hero} from './components/Hero';
import {Lifecycle} from './components/Lifecycle';
import {LiveMarket} from './components/Live';
import {Product} from './components/Product';
import {SecurityPage} from './components/SecurityPage';
import {Stats} from './components/Stats';
import {Updates} from './components/Updates';

function Home() {
  return (
    <div className="bg-page text-ink">
      <div className="relative">
        <Header />
        <Hero />
      </div>
      <Stats />
      <Product />
      <Lifecycle />
      <Containment />
      <Charts />
      <Api />
      <Architecture />
      <Compare />
      <Updates />
      <LiveMarket />
      <Footer />
    </div>
  );
}

/** Flat path router. The build is a static SPA; vercel.json rewrites deep
 *  links to index.html so these paths resolve on a hard load. */
export default function App() {
  const path = window.location.pathname.replace(/\/+$/, '') || '/';
  if (path === '/security') return <SecurityPage />;
  if (path === '/devlog') return <DevLogPage />;
  return <Home />;
}
