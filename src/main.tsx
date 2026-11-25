import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, HashRouter } from 'react-router-dom';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import './styles.css';

// Förhandsvisning (t.ex. i Claude) körs utan service worker och med hash-routing
const preview = import.meta.env.VITE_PREVIEW === '1';
if (!preview) registerSW({ immediate: true });
const Router = ({ children }: { children: React.ReactNode }) =>
  preview ? (
    <HashRouter>{children}</HashRouter>
  ) : (
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>{children}</BrowserRouter>
  );

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Router>
      <App />
    </Router>
  </StrictMode>,
);
