import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

const stored = localStorage.getItem('socialmk.theme');
if (stored === 'dark' || stored === 'light') {
  document.documentElement.dataset.theme = stored;
} else if (window.matchMedia?.('(prefers-color-scheme: dark)').matches) {
  document.documentElement.dataset.theme = 'dark';
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
