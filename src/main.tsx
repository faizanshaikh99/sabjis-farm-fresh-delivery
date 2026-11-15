import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { initApiInterceptor } from './utils/apiHelper';
import { ErrorBoundary } from './components/ErrorBoundary';

// Global resilience handlers to prevent raw uncaught exceptions from breaking the app
if (typeof window !== 'undefined') {
  window.addEventListener('unhandledrejection', (event) => {
    console.warn('[Global Guard] Caught unhandled promise rejection:', event.reason);
    event.preventDefault();
  });

  window.addEventListener('error', (event) => {
    console.warn('[Global Guard] Caught unhandled window error:', event.message || event.error);
  });
}

// Initialize dynamic backend API router (handles VITE_API_URL seamlessly)
initApiInterceptor();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);


