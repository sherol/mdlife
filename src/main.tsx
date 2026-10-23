// Must be the first import: detects ?mock=true / ?offline=true and isolates mock storage
// before any other module touches localStorage.
import './utils/storageKeys';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { initFavicon } from './utils/favicon';

initFavicon();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
