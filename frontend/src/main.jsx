import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { MockDataProvider } from './context/MockDataContext.jsx';
import './index.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <MockDataProvider>
      <App />
    </MockDataProvider>
  </StrictMode>,
)
