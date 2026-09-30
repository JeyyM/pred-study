import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { isValidationAvailable } from './utils/localHost.js';
import './App.css';

const loadValidationScreen = import.meta.env.DEV
  ? () => import('./components/ValidationScreen.jsx')
  : null;
const loadDashboardScreen = import.meta.env.DEV
  ? () => import('./components/DashboardScreen.jsx')
  : null;

function researcherPath() {
  const path = window.location.pathname.replace(/\/+$/, '') || '/';
  if (path === '/validation' || path.startsWith('/validation/')) return 'validation';
  if (path === '/dashboard' || path.startsWith('/dashboard/')) return 'dashboard';
  return 'study';
}

function Root() {
  const [route, setRoute] = useState(() => (isValidationAvailable() ? researcherPath() : 'study'));
  const [ValidationScreen, setValidationScreen] = useState(null);
  const [DashboardScreen, setDashboardScreen] = useState(null);

  useEffect(() => {
    const sync = () => {
      if (!isValidationAvailable()) {
        const path = researcherPath();
        if (path !== 'study') window.history.replaceState(null, '', '/');
        setRoute('study');
        return;
      }
      setRoute(researcherPath());
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

  useEffect(() => {
    if (route !== 'dashboard' || !loadDashboardScreen) return undefined;
    let cancelled = false;
    loadDashboardScreen().then((mod) => {
      if (!cancelled) setDashboardScreen(() => mod.default);
    });
    return () => {
      cancelled = true;
    };
  }, [route]);

  if (route === 'validation') {
    if (ValidationScreen) return <ValidationScreen />;
    return (
      <section className="screen active">
        <div className="panel">
          <p>Loading validation…</p>
        </div>
      </section>
    );
  }
  if (route === 'dashboard') {
    if (DashboardScreen) return <DashboardScreen />;
    return (
      <section className="screen active">
        <div className="panel">
          <p>Loading dashboard…</p>
        </div>
      </section>
    );
  }
  return <App />;
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
