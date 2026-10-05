import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Download, WifiOff, RefreshCw, Smartphone, X } from 'lucide-react';
import { Button } from './ui';
import { useOnlineStatus } from '../hooks/useMediaQuery';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISS_KEY = 'mangaud.install-dismissed';

/**
 * Registers the service worker and surfaces an install affordance.
 *
 * Both pieces are deliberately deferred until after load: the SW competes with
 * the app's own chunks for bandwidth on a cold start, and `beforeinstallprompt`
 * only fires once the page is genuinely installable.
 */
export function PwaManager() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const isOnline = useOnlineStatus();

  useEffect(() => {
    // An already-installed PWA reports itself through display-mode, and the
    // prompt event never fires — so check both.
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setInstalled(true);
      return;
    }

    const onPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };

    const onInstalled = () => {
      setInstalled(true);
      setDeferredPrompt(null);
      localStorage.removeItem(DISMISS_KEY);
    };

    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    if (process.env.NODE_ENV !== 'production') {
      /*
       * Development has to actively *undo* the production worker, not merely
       * decline to register one.
       *
       * Both modes are served from the same origin - `localhost:3000` - so
       * running the production build once leaves a worker registered and
       * controlling that origin. Its handler is cache-first for `/static/`, and
       * the dev server serves a stable `/static/js/bundle.js`. The worker
       * therefore caches the dev bundle on first load and serves that copy
       * forever after: edits stop appearing, a stale bundle can talk to an API
       * whose shape has since changed, and the result presents as "the page
       * doesn't load" or "my changes did not apply" - never as a cache problem.
       *
       * Registering conditionally is not enough; nothing else ever cleaned up.
       */
      navigator.serviceWorker
        .getRegistrations()
        .then((registrations) => Promise.all(registrations.map((r) => r.unregister())))
        .catch(() => {
          /* Nothing registered, or the browser refused. Either way, harmless. */
        });
      if (typeof caches !== 'undefined') {
        caches
          .keys()
          .then((keys) =>
            Promise.all(
              keys.filter((k) => k.startsWith('mangaud-')).map((k) => caches.delete(k))
            )
          )
          .catch(() => {});
      }
      return;
    }

    const register = () => {
      navigator.serviceWorker
        .register(`${process.env.PUBLIC_URL}/sw.js`, { scope: '/' })
        .then((registration) => {
          // Pick up a new worker as soon as it finishes installing rather than
          // waiting for every tab to close.
          registration.addEventListener('updatefound', () => {
            const worker = registration.installing;
            if (!worker) return;
            worker.addEventListener('statechange', () => {
              if (worker.state === 'installed' && navigator.serviceWorker.controller) {
                toast('A new version is ready', {
                  id: 'sw-update',
                  duration: 60_000,
                  icon: 'â†»',
                });
              }
            });
          });
        })
        .catch(() => {
          // A failed registration must never break the app; the SW is an
          // enhancement, not a requirement.
        });
    };

    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });

    return () => window.removeEventListener('load', register);
  }, []);

  useEffect(() => {
    if (isOnline) return;
    toast('You are offline. Banking data needs a connection.', {
      id: 'offline',
      icon: 'âš ',
      duration: 8000,
    });
  }, [isOnline]);

  if (installed || !deferredPrompt) return null;
  if (localStorage.getItem(DISMISS_KEY) === '1') return null;

  /*
   * A single compact row, not a card.
   *
   * The previous version was a ~140px card pinned bottom-right, which sat
   * directly on top of the dashboard's Alerts panel and hid two of its lines.
   * Anything that permanently covers live content is the wrong shape for a
   * suggestion; one row with a dismiss button costs a fraction of the space.
   */
  return (
    /*
     * A full-width strip in normal flow, not a floating pill.
     *
     * This was a `fixed` element pinned bottom-right -- first as a ~140px card,
     * then as a single pill -- and both sat on top of live content. Even one row
     * covered the dashboard's "View all >" link and part of the Alerts panel on
     * mobile, because the bottom-right corner of a scrolling page is never empty.
     *
     * The fix is structural rather than a matter of making it smaller: give it
     * layout space instead of overlaying. The app shell places it directly under
     * the header, so it pushes content down rather than hiding it, and it
     * scrolls with the page. Nothing else in the app overlays persistent content
     * either -- that is the rule this is following.
     */
    <div className="flex items-center gap-3 border-b border-brand-line bg-brand-quiet px-4 py-2">
      <Smartphone className="h-4 w-4 shrink-0 text-brand-ink" aria-hidden="true" />
      <p className="min-w-0 flex-1 truncate text-xs text-ink-soft">
        Add MANGAUD to your home screen for offline access
      </p>
      <Button
        size="sm"
        variant="brand"
        leftIcon={<Download className="h-3.5 w-3.5" />}
        onClick={async () => {
          await deferredPrompt.prompt();
          const choice = await deferredPrompt.userChoice;
          if (choice.outcome === 'accepted') setInstalled(true);
          setDeferredPrompt(null);
        }}
        className="shrink-0"
      >
        Install
      </Button>
      <button
        type="button"
        onClick={() => {
          localStorage.setItem(DISMISS_KEY, '1');
          setDeferredPrompt(null);
        }}
        aria-label="Dismiss install prompt"
        className="grid h-7 w-7 shrink-0 place-items-center rounded text-muted transition-colors hover:bg-card hover:text-text"
      >
        <X className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}

/**
 * Compact offline strip, shown in the app shell on every page.
 *
 * Rendered by `MainLayout` in normal flow. It used to be exported and imported
 * by `App.tsx`, which never rendered it -- so the app shipped an offline
 * indicator that did not exist on screen.
 */
export function OfflineBanner() {
  const isOnline = useOnlineStatus();
  if (isOnline) return null;

  return (
    <div
      role="status"
      className="flex items-center justify-center gap-2 bg-danger px-4 py-2 text-xs font-medium text-inverse"
    >
      <WifiOff className="h-3.5 w-3.5" aria-hidden="true" />
      Offline - figures may be out of date
      <button
        onClick={() => window.location.reload()}
        className="inline-flex items-center gap-1 underline underline-offset-2"
      >
        <RefreshCw className="h-3 w-3" aria-hidden="true" />
        Retry
      </button>
    </div>
  );
}

export default PwaManager;