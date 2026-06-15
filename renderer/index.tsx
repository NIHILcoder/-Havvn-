import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
// Self-hosted Inter (bundled) — the prod CSP blocks the Google Fonts CDN, so
// loading it locally is the only way the app actually renders in Inter when packaged.
import '@fontsource/inter/300.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@fontsource/inter/800.css';
import './index.css';
import { armSplashFailsafe } from './utils/splash';

// Force the startup splash down even if the app never reports ready (mount error,
// slow engine). Armed the moment the bundle runs, so the splash can't get stuck.
armSplashFailsafe(6000);

const root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
