import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Palette, ShieldCheck, User, LogOut, Monitor, Moon, Sun, Check } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../services/api';
import { useTheme } from '../hooks/useTheme';
import { useAuthStore } from '../store/authStore';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, Button, Badge } from '../components/ui';

/**
 * Settings.
 *
 * This page previously presented nine controls -- push / email / SMS
 * notification preferences, two-factor authentication, a language selector, data
 * export and account deletion -- backed by nothing but local `useState`. Every
 * one of them rendered as a working setting, accepted a click, and then
 * discarded it on reload. Worse than having no control: a user who turns off
 * email notifications is entitled to believe they have.
 *
 * There is no preferences endpoint on the server, so rather than ship controls
 * that lie, this page now offers only what actually works:
 *
 *   - the theme, which `useTheme` genuinely persists;
 *   - links to the pages that own the real settings (Security for password and
 *     sessions, Profile for personal details);
 *   - revoking every session, which is a real endpoint.
 *
 * If notification preferences are wanted later, they need a
 * `GET/PUT /preferences` on the server and a `preferences` field on the user.
 * That is a feature, not a wiring fix, so it is not faked here.
 */

const toneFor = (icon: React.ReactNode, tone: 'brass' | 'green' | 'blue' | 'red') => {
  const tones = {
    brass: 'bg-brass-50 text-brass-700',
    green: 'bg-success-50 text-success-700',
    blue: 'bg-primary-50 text-primary-700',
    red: 'bg-danger-50 text-danger-700',
  } as const;
  return (
    <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg ${tones[tone]}`} aria-hidden="true">
      {icon}
    </div>
  );
};

export function Settings() {
  const { theme, setTheme } = useTheme();
  const logout = useAuthStore((s) => s.logout);
  const [isRevoking, setIsRevoking] = useState(false);

  const revokeEverywhere = async () => {
    setIsRevoking(true);
    try {
      await api.revokeAllSessions();
      // Every server-side session is gone, including this one, so the access
      // token is dead too. Sign out locally rather than leaving a token that
      // the next request will reject.
      await logout();
      toast.success('Signed out of all devices');
    } catch {
      toast.error('Could not revoke your sessions. Try again.');
    } finally {
      setIsRevoking(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text">Settings</h1>
        <p className="mt-1 text-muted">
          Preferences that apply to this browser, and the places your account settings live.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Palette className="h-5 w-5 text-brass-600" aria-hidden="true" />
            Appearance
          </CardTitle>
          <CardDescription>
            Saved in this browser and applied before the page paints, so it survives a reload
            without a flash of the wrong theme.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div
            role="radiogroup"
            aria-label="Theme"
            className="grid gap-3 sm:grid-cols-3"
          >
            {(
              [
                { value: 'light' as const, label: 'Light', Icon: Sun },
                { value: 'dark' as const, label: 'Dark', Icon: Moon },
                { value: 'system' as const, label: 'Match system', Icon: Monitor },
              ] as const
            ).map(({ value, label, Icon }) => {
              /*
               * "Match system" clears the stored choice rather than storing a
               * third value, because `useTheme` follows the OS exactly while no
               * explicit preference is present -- that is the existing
               * behaviour, and adding a stored sentinel would need the hook to
               * learn a mode it does not have.
               */
              const active =
                value === 'system'
                  ? !window.localStorage.getItem('mangaud.theme')
                  : theme === value;

              return (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => {
                    if (value === 'system') {
                      try {
                        window.localStorage.removeItem('mangaud.theme');
                      } catch {
                        /* ignore */
                      }
                      setTheme(
                        window.matchMedia?.('(prefers-color-scheme: dark)').matches
                          ? 'dark'
                          : 'light'
                      );
                    } else {
                      setTheme(value);
                    }
                  }}
                  className={`flex items-center justify-between gap-3 rounded-lg border px-4 py-3 text-left transition-colors ${
                    active
                      ? 'border-brass-400 bg-brass-50/60 text-text'
                      : 'border-border bg-card text-ink-soft hover:border-brass-300'
                  }`}
                >
                  <span className="flex items-center gap-2.5">
                    <Icon className="h-4 w-4" aria-hidden="true" />
                    <span className="text-sm font-medium">{label}</span>
                  </span>
                  {active && <Check className="h-4 w-4 text-brass-600" aria-hidden="true" />}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-brass-600" aria-hidden="true" />
            Your account
          </CardTitle>
          <CardDescription>
            Password, active sessions and your own sign-in history live on their own pages.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between gap-4 rounded-lg border border-border p-4">
            <div className="flex items-center gap-4">
              {toneFor(<ShieldCheck className="h-5 w-5" />, 'green')}
              <div>
                <p className="font-medium text-text">Security</p>
                <p className="text-sm text-muted">
                  Change your password, review where you are signed in, revoke a session
                </p>
              </div>
            </div>
            <Link to="/security" className="btn btn-outline btn-sm">
              Open
            </Link>
          </div>

          <div className="flex items-center justify-between gap-4 rounded-lg border border-border p-4">
            <div className="flex items-center gap-4">
              {toneFor(<User className="h-5 w-5" />, 'blue')}
              <div>
                <p className="font-medium text-text">Profile</p>
                <p className="text-sm text-muted">
                  Your name, contact details and registered address
                </p>
              </div>
            </div>
            {/*
              A router `Link` styled as a button, rather than a `Link` nested
              inside a `<Button>`. `Button` always renders a `<button>`, and an
              `<a>` inside a `<button>` is invalid HTML that screen readers and
              keyboard navigation both handle badly.
            */}
            <Link to="/profile" className="btn btn-outline btn-sm">
              Open
            </Link>
          </div>
        </CardContent>
      </Card>

      <Card className="border-danger-100">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-danger-700">
            <LogOut className="h-5 w-5" aria-hidden="true" />
            Sign out everywhere
          </CardTitle>
          <CardDescription>
            Revokes every stored session on the server, including this one. Use this if you think
            someone else has access to your account.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-danger-100 bg-danger-50/50 p-4">
            <div className="flex items-center gap-4">
              {toneFor(<LogOut className="h-5 w-5" />, 'red')}
              <div>
                <p className="font-medium text-text">Revoke all sessions</p>
                <p className="text-sm text-muted">
                  You will be signed out of this device too and asked to sign in again.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2.5">
              <Badge variant="danger">Irreversible</Badge>
              <Button
                variant="danger"
                size="sm"
                onClick={revokeEverywhere}
                isLoading={isRevoking}
              >
                Sign out all
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default Settings;