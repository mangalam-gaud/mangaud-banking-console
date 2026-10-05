import { Link } from 'react-router-dom';
import { Compass, ArrowLeft } from 'lucide-react';
import { Logo } from '../components/layout/Logo';
import { Button } from '../components/ui';

export function NotFound() {
  return (
    <div className="min-h-screen bg-background grid place-items-center p-6 safe-t safe-b">
      <div className="text-center max-w-md">
        <Logo className="h-12 w-12 mx-auto rounded-2xl" showWordmark={false} />

        <p className="font-display text-6xl font-bold text-brass-500 mt-8 tnum">404</p>
        <h1 className="font-display text-2xl font-bold text-text mt-2">This page doesn't exist</h1>
        <p className="text-sm text-muted mt-2 leading-relaxed">
          The link may be out of date, or the page may have been moved. Everything else in
          MANGAUD is still where you left it.
        </p>

        <div className="flex flex-wrap gap-2.5 justify-center mt-7">
          <Link to="/dashboard">
            <Button variant="brass" leftIcon={<Compass className="w-4 h-4" />}>
              Back to dashboard
            </Button>
          </Link>
          <Link to="/accounts">
            <Button variant="secondary" leftIcon={<ArrowLeft className="w-4 h-4" />}>
              My accounts
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

export default NotFound;
