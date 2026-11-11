import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App.tsx';
import './styles/tokens.css';
import './styles/exchange.css';
import './styles/haunt.css';

const host = document.getElementById('exchange');

if (host === null) {
  throw new Error('The exchange has no mount point.');
}

createRoot(host).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
