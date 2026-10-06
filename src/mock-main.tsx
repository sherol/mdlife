import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { initFavicon } from './utils/favicon';

initFavicon();

// Pre-set bypassed auth in localStorage for full offline mock resilience
try {
  localStorage.setItem('md_vault_bypassed_auth', 'true');
} catch (e) {
  console.warn('Unable to write to localStorage in mock mode:', e);
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App forceOffline={true} />
  </StrictMode>
);
