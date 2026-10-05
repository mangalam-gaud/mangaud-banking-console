import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AuthScene } from '../three/AuthScene';
import { Logo } from './Logo';
import { ThemeToggle } from './ThemeToggle';

/**
 * Centered card shell for the auth screens. It takes children directly (rather
 * than rendering an <Outlet />) so App.tsx can pass the page element in.
 */
export function AuthLayout({ children }: { children?: ReactNode }) {
  return (
    <div className="relative min-h-screen flex items-center justify-center px-4 py-10 sm:py-14 overflow-hidden">
      {/* The 3D layer is a fixed, pointer-events-none backdrop. It needs an
          explicit z-0 and the content an explicit z-10: `-z-10` would push it
          behind the page background and the negative stacking context made
          sibling content paint on top of the logo unpredictably. */}
      <AuthScene />

      <div className="relative z-10 w-full max-w-md my-auto">
        {/* The theme switch has to be here as well as in the app header: the
            auth screens have no Header of their own, and someone signing in on
            a laptop set to dark should not get a white page. */}
        <div className="flex justify-end mb-4">
          <ThemeToggle className="!bg-ink/30 !border-white/15" />
        </div>

        {/* The wordmark sits directly on the dark 3D backdrop, outside the
            card, so it needs light text. */}
        <div className="text-center mb-7">
          <Link to="/" className="inline-flex flex-col items-center gap-3 group">
            <Logo className="h-14 w-14 rounded-2xl shadow-pop" showWordmark={false} />
            <span className="flex flex-col leading-none">
              <span className="font-display text-xl font-bold tracking-[0.16em] text-white">
                MANGAUD
              </span>
              <span className="text-[0.5625rem] uppercase tracking-[0.28em] text-brass-300/70 mt-1.5">
                Banking Console
              </span>
            </span>
          </Link>
        </div>

        <div className="card p-6 sm:p-8 shadow-pop">{children}</div>

        {/*
          What this line used to say: "Protected by 256-bit encryption. Your
          session ends automatically." Neither half was true. Passwords are
          hashed with bcrypt, not encrypted with a 256-bit cipher, and a session
          ends when its token expires *or* when somebody revokes it — which is a
          mechanism, not an automatic timer.

          A reassuring claim on a sign-in screen is a security promise made to
          someone who cannot check it, and this one was checkable and wrong. The
          replacement says only what the code actually does, and says something
          genuinely useful instead: the demo credentials, because this build ships
          them and a visitor should not have to go and find them.
        */}
        <p className="mt-6 text-center text-xs text-white/45 leading-relaxed">
          Passwords are hashed with bcrypt and never stored in plain text.
          <span className="block mt-1">Sessions are revocable from Security at any time.</span>
        </p>
      </div>
    </div>
  );
}

export default AuthLayout;
