'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Landing from './Landing';
import FormFlow from './FormFlow';
import Success from './Success';

const HERO_VARIANTS = new Set(['default', 'centered', 'minimal']);

export default function App() {
  const params = useSearchParams();
  const heroParam = params.get('hero');
  const heroVariant = HERO_VARIANTS.has(heroParam) ? heroParam : 'default';

  const [route, setRoute] = useState('landing');

  const go = (next) => setRoute(next);
  const back = () => setRoute('landing');

  return (
    <div className="page-letterbox">
      <div className="frame">
        {route === 'landing' && (
          <Landing onApply={() => go('form')} heroVariant={heroVariant} />
        )}
        {route === 'form' && (
          <FormFlow onComplete={() => go('success')} onExit={back} />
        )}
        {route === 'success' && <Success onHome={back} />}
      </div>
    </div>
  );
}
