// Must be the first import: isolates mock-mode storage ("mock_" key prefix) and disables
// Google Drive sync before any other module touches localStorage.
import './utils/mockModeInit';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { initFavicon } from './utils/favicon';

initFavicon();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App forceOffline={true} />
  </StrictMode>,
);
