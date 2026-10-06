import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import App from './App';
import { AuthProvider } from './hooks/useAuth';
import { ErrorBoundary } from './components/ErrorBoundary';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <App />
          <Toaster
            position="top-center"
            gutter={8}
            containerClassName="!top-16"
            toastOptions={{
              duration: 4000,
              className:
                '!rounded-xl !border !border-border !bg-card !text-ink-soft !font-sans !text-sm !shadow-pop !px-4 !py-3',
              success: { iconTheme: { primary: '#059669', secondary: '#FFFDFA' } },
              error: { iconTheme: { primary: '#BE2032', secondary: '#FFFDFA' } },
            }}
          />
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>
);

/*
 * Take the boot splash down once React has actually painted.
 *
 * `index.html` ships a splash inside the served HTML, because `#root` is empty
 * until the bundle arrives and an empty page during a webpack compile reads as
 * a broken app rather than a loading one.
 *
 * Removed on a double requestAnimationFrame rather than immediately: React has
 * committed to the DOM by the time `render` returns, but the browser has not
 * painted it yet, and removing the splash in between shows a flash of empty
 * page -- trading one flash for another.
 *
 * The failsafe matters more than the happy path. If the bundle throws while
 * evaluating, none of the code above runs and the splash would sit on top of a
 * blank page forever, turning a visible error into an unexplained hang. The
 * ErrorBoundary cannot help either: it only catches render errors, not a module
 * that never evaluated. So the splash is also removed on a timer.
 */
const dismissBootSplash = () => {
  const splash = document.getElementById('boot');
  if (splash) splash.remove();
};

requestAnimationFrame(() => requestAnimationFrame(dismissBootSplash));
window.setTimeout(dismissBootSplash, 8000);
