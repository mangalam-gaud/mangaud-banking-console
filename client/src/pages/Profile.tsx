import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { User, Mail, Phone, Calendar, Save, Loader2 } from 'lucide-react';
import { Button, Input, Card, CardHeader, CardTitle, CardDescription, CardContent } from '../components/ui';
import { useAuthStore } from '../store/authStore';
import toast from 'react-hot-toast';

const profileSchema = z.object({
  firstName: z.string().min(1, 'First name is required').max(50),
  lastName: z.string().min(1, 'Last name is required').max(50),
  phone: z.string().min(10, 'Phone number must be at least 10 digits').max(15),
  address: z.string().max(250).optional(),
  dateOfBirth: z.string().optional(),
});

type ProfileForm = z.infer<typeof profileSchema>;

const passwordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
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

type PasswordForm = z.infer<typeof passwordSchema>;

export function Profile() {
  const { user, updateProfile, changePassword } = useAuthStore();
  const [activeTab, setActiveTab] = useState<'profile' | 'password'>('profile');
  const [isLoading, setIsLoading] = useState(false);

  const {
    register: registerProfile,
    handleSubmit: handleSubmitProfile,
    formState: { errors: profileErrors },
  } = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      firstName: user?.firstName || '',
      lastName: user?.lastName || '',
      phone: user?.phone || '',
    },
  });

  const {
    register: registerPassword,
    handleSubmit: handleSubmitPassword,
    formState: { errors: passwordErrors },
  } = useForm<PasswordForm>({
    resolver: zodResolver(passwordSchema),
  });

  const handleUpdateProfile = async (data: ProfileForm) => {
    setIsLoading(true);
    try {
      await updateProfile(data);
      toast.success('Profile updated successfully!');
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to update profile');
    } finally {
      setIsLoading(false);
    }
  };

  const handleChangePassword = async (data: PasswordForm) => {
    setIsLoading(true);
    try {
      await changePassword({
        currentPassword: data.currentPassword,
        newPassword: data.newPassword,
      });
      toast.success('Password changed successfully!');
      // `key` is a plain string here, so type the register() call accordingly.
      (Object.keys(data) as Array<keyof PasswordForm>).forEach((key) => {
        registerPassword(key).onChange({ target: { value: '' } });
      });
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to change password');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text">Profile Settings</h1>
        <p className="text-muted mt-1">Manage your account settings and preferences</p>
      </div>

      <div className="flex gap-2 border-b border-border mb-6">
        <Button
          variant={activeTab === 'profile' ? 'primary' : 'ghost'}
          onClick={() => setActiveTab('profile')}
          className="flex-1"
          leftIcon={<User className="w-4 h-4" />}
        >
          Profile
        </Button>
        <Button
          variant={activeTab === 'password' ? 'primary' : 'ghost'}
          onClick={() => setActiveTab('password')}
          className="flex-1"
          leftIcon={<Save className="w-4 h-4" />}
        >
          Security
        </Button>
      </div>

      {activeTab === 'profile' && (
        <Card>
          <CardHeader>
            <CardTitle>Personal Information</CardTitle>
            <CardDescription>Update your personal details</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmitProfile(handleUpdateProfile)} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  label="First Name"
                  leftIcon={<User className="w-5 h-5" />}
                  error={profileErrors.firstName?.message}
                  {...registerProfile('firstName')}
                />
                <Input
                  label="Last Name"
                  leftIcon={<User className="w-5 h-5" />}
                  error={profileErrors.lastName?.message}
                  {...registerProfile('lastName')}
                />
              </div>

              <Input
                label="Email"
                type="email"
                leftIcon={<Mail className="w-5 h-5" />}
                disabled
                value={user?.email}
                className="bg-sunken"
              />

              <Input
                label="Phone"
                type="tel"
                leftIcon={<Phone className="w-5 h-5" />}
                error={profileErrors.phone?.message}
                {...registerProfile('phone')}
              />

              <Input
                label="Address"
                placeholder="Your address"
                error={profileErrors.address?.message}
                {...registerProfile('address')}
              />

              <Input
                label="Date of Birth"
                type="date"
                leftIcon={<Calendar className="w-5 h-5" />}
                error={profileErrors.dateOfBirth?.message}
                {...registerProfile('dateOfBirth')}
              />

              <div className="flex justify-end pt-4">
                <Button type="submit" size="lg" isLoading={isLoading} leftIcon={<Save className="w-4 h-4" />}>
                  Save Changes
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {activeTab === 'password' && (
        <Card>
          <CardHeader>
            <CardTitle>Change Password</CardTitle>
            <CardDescription>Update your password for security</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmitPassword(handleChangePassword)} className="space-y-4">
              <Input
                label="Current Password"
                type="password"
                leftIcon={<Save className="w-5 h-5" />}
                error={passwordErrors.currentPassword?.message}
                {...registerPassword('currentPassword')}
              />

              <Input
                label="New Password"
                type="password"
                leftIcon={<Save className="w-5 h-5" />}
                error={passwordErrors.newPassword?.message}
                {...registerPassword('newPassword')}
              />

              <Input
                label="Confirm New Password"
                type="password"
                leftIcon={<Save className="w-5 h-5" />}
                error={passwordErrors.confirmPassword?.message}
                {...registerPassword('confirmPassword')}
              />

              <div className="p-4 rounded-lg bg-warning-50 border border-warning-100">
                <p className="text-sm text-warning-700">
                  <strong>Password requirements:</strong> At least 8 characters, one uppercase letter, one lowercase letter, one number, and one special character.
                </p>
              </div>

              <div className="flex justify-end pt-4">
                <Button type="submit" size="lg" isLoading={isLoading} leftIcon={<Save className="w-4 h-4" />}>
                  Change Password
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

