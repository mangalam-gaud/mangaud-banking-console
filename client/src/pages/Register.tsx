import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Eye, EyeOff, Mail, Lock, User, Phone, AlertCircle, Check } from 'lucide-react';
import { Button, Input, Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '../components/ui';
import { useAuth } from '../hooks/useAuth';
import { checkPassword, STRENGTH_LABELS, STRENGTH_CLASSES } from '../utils/password';
import { cn } from '../utils/cn';
import toast from 'react-hot-toast';

const registerSchema = z.object({
  firstName: z.string().min(1, 'First name is required').max(50),
  lastName: z.string().min(1, 'Last name is required').max(50),
  email: z.string().email('Invalid email address'),
  phone: z.string().min(10, 'Phone number must be at least 10 digits').max(15),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number')
    .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character'),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

type RegisterForm = z.infer<typeof registerSchema>;

export function Register() {
  const navigate = useNavigate();
  const { register: registerUser, isLoading } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors: formErrors },
  } = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
    // `watch('password')` returns undefined for a field with no default, and
    // the strength meter reads it on first render. Seeding every field keeps
    // the form controlled from the start.
    defaultValues: {
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      password: '',
      confirmPassword: '',
    },
  });

  const handleRegister = async (data: RegisterForm) => {
    setErrors({});
    try {
      await registerUser({
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        phone: data.phone,
        password: data.password,
        confirmPassword: data.confirmPassword,
      });
      toast.success('Account created successfully!');
      navigate('/dashboard');
    } catch (error: any) {
      const message = error.response?.data?.error || error.message || 'Registration failed';
      if (message.includes('email') || message.includes('phone') || message.exists) {
        setErrors({ form: message });
      } else {
        toast.error(message);
      }
    }
  };

  const password = watch('password');
  const strength = checkPassword(password);

  return (
    <div className="w-full max-w-md mx-auto">
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Create an account</CardTitle>
          <CardDescription>Join Mangaud Banking Console today</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(handleRegister)} className="space-y-4">
            {errors.form && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-danger-50 text-danger-700 text-sm">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {errors.form}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <Input
                label="First Name"
                placeholder="John"
                leftIcon={<User className="w-5 h-5" />}
                error={formErrors.firstName?.message}
                {...register('firstName')}
              />
              <Input
                label="Last Name"
                placeholder="Doe"
                leftIcon={<User className="w-5 h-5" />}
                error={formErrors.lastName?.message}
                {...register('lastName')}
              />
            </div>

            <Input
              label="Email"
              type="email"
              placeholder="you@example.com"
              leftIcon={<Mail className="w-5 h-5" />}
              error={formErrors.email?.message}
              {...register('email')}
            />

            <Input
              label="Phone"
              type="tel"
              placeholder="+1234567890"
              leftIcon={<Phone className="w-5 h-5" />}
              error={formErrors.phone?.message}
              {...register('phone')}
            />

            <div className="relative">
              <Input
                label="Password"
                type={showPassword ? 'text' : 'password'}
                placeholder="Create a strong password"
                leftIcon={<Lock className="w-5 h-5" />}
                error={formErrors.password?.message}
                {...register('password')}
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

            {password ? (
              <div className="space-y-2.5">
                <div className="flex items-center justify-between gap-3">
                  <div
                    className="h-1.5 flex-1 rounded-full bg-rule overflow-hidden"
                    role="meter"
                    aria-valuenow={strength.score}
                    aria-valuemin={0}
                    aria-valuemax={4}
                    aria-label="Password strength"
                  >
                    <div
                      className={cn(
                        'h-full rounded-full transition-all duration-300',
                        STRENGTH_CLASSES[strength.score]
                      )}
                      style={{ width: `${((strength.score + 1) / 5) * 100}%` }}
                    />
                  </div>
                  <span className="text-xs font-medium text-muted shrink-0">
                    {STRENGTH_LABELS[strength.score]}
                  </span>
                </div>

                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
                  {strength.rules.map((rule) => (
                    <li
                      key={rule.id}
                      className={cn(
                        'flex items-center gap-1.5 text-xs',
                        rule.met ? 'text-success-700' : 'text-muted'
                      )}
                    >
                      <span
                        className={cn(
                          'grid place-items-center h-3.5 w-3.5 rounded-full shrink-0 border',
                          rule.met
                            ? 'bg-success-600 border-success-600 text-white'
                            : 'border-rule'
                        )}
                        aria-hidden="true"
                      >
                        {rule.met ? <Check className="h-2.5 w-2.5" /> : null}
                      </span>
                      {rule.label}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <Input
              label="Confirm Password"
              type={showPassword ? 'text' : 'password'}
              placeholder="Confirm your password"
              leftIcon={<Lock className="w-5 h-5" />}
              error={formErrors.confirmPassword?.message}
              {...register('confirmPassword')}
            />

            <Button type="submit" className="w-full" size="lg" isLoading={isLoading}>
              Create account
            </Button>
          </form>
        </CardContent>
        <CardFooter className="flex flex-col items-center gap-2">
          <p className="text-sm text-muted">
            Already have an account?{' '}
            <Link to="/login" className="text-primary-600 hover:text-primary-700 font-medium">
              Sign in
            </Link>
          </p>
          <p className="text-xs text-muted text-center">
            By creating an account, you agree to our Terms of Service and Privacy Policy.
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}
