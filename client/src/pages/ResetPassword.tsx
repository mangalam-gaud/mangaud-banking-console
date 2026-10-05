import { useState, useEffect } from 'react';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Lock, Eye, EyeOff, ArrowLeft, AlertCircle } from 'lucide-react';
import { Button, Input, Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '../components/ui';
import { useAuth } from '../hooks/useAuth';
import toast from 'react-hot-toast';

const resetPasswordSchema = z.object({
  newPassword: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number')
    .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character'),
  confirmPassword: z.string(),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

type ResetPasswordForm = z.infer<typeof resetPasswordSchema>;

export function ResetPassword() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { resetPassword, isLoading } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isValidToken, setIsValidToken] = useState(true);

  const token = searchParams.get('token');

  useEffect(() => {
    if (!token) {
      setIsValidToken(false);
    }
  }, [token]);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors: formErrors },
  } = useForm<ResetPasswordForm>({
    resolver: zodResolver(resetPasswordSchema),
  });

  const password = watch('newPassword');

  const handleSubmitForm = async (data: ResetPasswordForm) => {
    if (!token) return;
    
    setErrors({});
    try {
      await resetPassword(token, data.newPassword);
      toast.success('Password reset successful!');
      navigate('/login');
    } catch (error: any) {
      const message = error.response?.data?.error || 'Failed to reset password';
      if (message.includes('token') || message.includes('expired')) {
        setIsValidToken(false);
      } else {
        setErrors({ form: message });
      }
    }
  };

  const getPasswordStrength = (pwd: string) => {
    let strength = 0;
    if (pwd.length >= 8) strength++;
    if (/[A-Z]/.test(pwd)) strength++;
    if (/[a-z]/.test(pwd)) strength++;
    if (/[0-9]/.test(pwd)) strength++;
    if (/[^A-Za-z0-9]/.test(pwd)) strength++;
    return strength;
  };

  const strength = getPasswordStrength(password);
  const strengthLabels = ['Very weak', 'Weak', 'Fair', 'Good', 'Strong'];
  /*
   * A five-step ramp, so it has to span five hues -- there is no single token
   * that means "weak but not critical". Built from the theme's own `danger` and
   * `warning` ramps plus the built-in Tailwind colours for the middle steps,
   * which do not follow dark mode but are only ever seen as a solid bar, so the
   * mismatch is not observable.
   */
  const strengthColors = [
    'bg-danger-500',
    'bg-orange-500',
    'bg-warning-500',
    'bg-lime-500',
    'bg-success-500',
  ];

  if (!isValidToken) {
    return (
      <div className="w-full max-w-md mx-auto">
        <Card className="text-center py-12">
          <AlertCircle className="w-16 h-16 text-danger-700 mx-auto mb-4" />
          <CardTitle className="text-2xl">Invalid Reset Link</CardTitle>
          <CardDescription className="mt-2">
            This password reset link is invalid or has expired.
          </CardDescription>
          <Link to="/forgot-password" className="mt-6 inline-block">
            <Button variant="outline" leftIcon={<ArrowLeft className="w-4 h-4" />}>
              Request New Link
            </Button>
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md mx-auto">
      <Card>
        <CardHeader className="text-center">
          <Link to="/login" className="inline-flex items-center gap-2 mb-6">
            <ArrowLeft className="w-5 h-5 text-muted hover:text-text" />
          </Link>
          <CardTitle className="text-2xl">Reset Password</CardTitle>
          <CardDescription>Enter your new password below</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(handleSubmitForm)} className="space-y-4">
            {errors.form && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-danger-50 text-danger-700 text-sm">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {errors.form}
              </div>
            )}

            <div className="relative">
              <Input
                label="New Password"
                type={showPassword ? 'text' : 'password'}
                placeholder="Create a strong password"
                leftIcon={<Lock className="w-5 h-5" />}
                error={formErrors.newPassword?.message}
                {...register('newPassword')}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-[38px] text-muted hover:text-text"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>

            {password && (
              <div className="space-y-1">
                <div className="h-1.5 rounded-full bg-rule overflow-hidden">
                  <div
                    className={`h-full transition-all duration-300 ${strengthColors[strength - 1] || 'bg-rule'}`}
                    style={{ width: `${(strength / 5) * 100}%` }}
                  />
                </div>
                <p className="text-xs text-muted">Password strength: {strengthLabels[strength - 1] || 'Very weak'}</p>
              </div>
            )}

            <Input
              label="Confirm New Password"
              type={showPassword ? 'text' : 'password'}
              placeholder="Confirm your new password"
              leftIcon={<Lock className="w-5 h-5" />}
              error={formErrors.confirmPassword?.message}
              {...register('confirmPassword')}
            />

            <Button type="submit" className="w-full" size="lg" isLoading={isLoading}>
              Reset Password
            </Button>
          </form>
        </CardContent>
        <CardFooter className="flex flex-col items-center gap-2">
          <p className="text-sm text-muted">
            Remember your password?{' '}
            <Link to="/login" className="text-primary-600 hover:text-primary-700 font-medium">
              Sign in
            </Link>
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}
