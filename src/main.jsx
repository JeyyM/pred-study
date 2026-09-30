import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { isValidationAvailable } from './utils/localHost.js';
import './App.css';

const loadValidationScreen = import.meta.env.DEV
  ? () => import('./components/ValidationScreen.jsx')
  : null;

function isValidationPath() {
  const path = window.location.pathname.replace(/\/+$/, '') || '/';
  return path === '/validation' || path.startsWith('/validation/');
}

function Root() {
  const [route, setRoute] = useState(() =>
    isValidationAvailable() && isValidationPath() ? 'validation' : 'study',
  );
  const [ValidationScreen, setValidationScreen] = useState(null);

  useEffect(() => {
    const sync = () => {
      if (!isValidationAvailable()) {
        const hash = window.location.hash.replace(/^#\/?/, '');
        if (isValidationPath() || hash === 'validation') {
          window.history.replaceState(null, '', '/');
        }
        setRoute('study');
        return;
      }

      const hash = window.location.hash.replace(/^#\/?/, '');
      if (hash === 'validation' && !isValidationPath()) {
        window.history.replaceState(null, '', '/validation');
      }
      setRoute(isValidationPath() ? 'validation' : 'study');
    };

    sync();
    window.addEventListener('popstate', sync);
    window.addEventListener('hashchange', sync);
    return () => {
      window.removeEventListener('popstate', sync);
      window.removeEventListener('hashchange', sync);
    };
  }, []);

  useEffect(() => {
    if (route !== 'validation' || !loadValidationScreen) return undefined;
    let cancelled = false;
    loadValidationScreen().then((mod) => {
      if (!cancelled) setValidationScreen(() => mod.default);
    });
    return () => {
      cancelled = true;
    };
  }, [route]);

  if (route === 'validation' && ValidationScreen) {
    return <ValidationScreen />;
  }

  return <App />;
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
