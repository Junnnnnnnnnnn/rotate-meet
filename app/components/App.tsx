'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Landing, { type HeroVariant } from './Landing';
import FormFlow from './FormFlow';
import Success from './Success';

type Route = 'landing' | 'form' | 'success';

const HERO_VARIANTS = new Set<HeroVariant>(['default', 'centered', 'minimal']);

function isHeroVariant(value: string | null): value is HeroVariant {
  return value !== null && HERO_VARIANTS.has(value as HeroVariant);
}

export default function App() {
  const params = useSearchParams();
  const heroParam = params.get('hero');
  const heroVariant: HeroVariant = isHeroVariant(heroParam) ? heroParam : 'default';

  const [route, setRoute] = useState<Route>('landing');

  const go = (next: Route) => setRoute(next);
  const back = () => setRoute('landing');

  return (
    <div className="page-letterbox">
      <div className="frame">
        {route === 'landing' && (
          <Landing onApply={() => go('form')} heroVariant={heroVariant} />
        )}
        {route === 'form' && (
          <FormFlow onComplete={() => go('success')} onExit={back} heroVariant={heroVariant} />
        )}
        {route === 'success' && <Success onHome={back} />}
      </div>
    </div>
  );
}
