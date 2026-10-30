import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { registerTuxiServiceWorker } from './utils/offlineQueueService';

// Initialize Service Worker to cache critical UI assets and enable background sync
registerTuxiServiceWorker();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
