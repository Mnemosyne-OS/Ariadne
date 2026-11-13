import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { onHostConfig } from './sdk/mnemo-sdk';
import './styles.css';

// Inside a Mnemosyne OS window, before the first paint: the window paints the
// ground and the page stays transparent (`html.in-host` in the CSS).
if (window.parent !== window) document.documentElement.classList.add('in-host');

// Inherit the host shell's look: the OS broadcasts its theme + LIVE design
// tokens (the user's custom accent included) on load and on every change.
onHostConfig();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
