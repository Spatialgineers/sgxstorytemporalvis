import React from 'react';
import ReactDOM from 'react-dom/client';
import './sgx-design-system.css';
import './fusion.css';
import { App } from './App';
import { Controller } from './components/Controller';

// ?ctrl=<sala> abre la vista de teléfono; sin eso, la pantalla principal.
const code = new URLSearchParams(window.location.search).get('ctrl');
const room = code && /^[a-z0-9]{4,12}$/.test(code) ? code : null;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>{room ? <Controller code={room} /> : <App />}</React.StrictMode>
);
