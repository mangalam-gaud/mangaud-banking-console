import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { cn } from '../../utils/cn';

interface FeatureFlag {
  key: string;
  enabled: boolean;
  description?: string;
  rolloutPercentage?: number;
  targetUsers?: string[];
  environments?: string[];
  dependencies?: string[];
  metadata?: Record<string, any>;
}

interface FeatureFlagsContextType {
  flags: Record<string, FeatureFlag>;
  isEnabled: (key: string, userId?: string) => boolean;
  enable: (key: string) => void;
  disable: (key: string) => void;
  toggle: (key: string) => void;
  getFlag: (key: string) => FeatureFlag | undefined;
  refreshFlags: () => Promise<void>;
  loading: boolean;
  error: Error | null;
}

const FeatureFlagsContext = createContext<FeatureFlagsContextType | null>(null);

const DEFAULT_FLAGS: Record<string, FeatureFlag> = {
  'new-dashboard': {
    key: 'new-dashboard',
    enabled: true,
    description: 'New redesigned dashboard with real-time widgets',
    rolloutPercentage: 100,
  },
  'realtime-transactions': {
    key: 'realtime-transactions',
    enabled: true,
    description: 'Live transaction streaming via WebSocket',
    rolloutPercentage: 100,
  },
  'investment-portfolio': {
    key: 'investment-portfolio',
    enabled: true,
    description: 'Investment portfolio management with real-time quotes',
    rolloutPercentage: 80,
  },
  'loan-calculator': {
    key: 'loan-calculator',
    enabled: true,
    description: 'EMI calculator with amortization schedule',
    rolloutPercentage: 100,
  },
  'shared-accounts': {
    key: 'shared-accounts',
    enabled: true,
    description: 'Collaborative account sharing with permissions',
    rolloutPercentage: 60,
  },
  'live-chat-support': {
    key: 'live-chat-support',
    enabled: true,
    description: 'Real-time chat support with agents',
    rolloutPercentage: 100,
  },
  'advanced-analytics': {
    key: 'advanced-analytics',
    enabled: true,
    description: 'Advanced analytics dashboard with forecasts',
    rolloutPercentage: 70,
  },
  'investment-portfolio-advanced': {
    key: 'investment-portfolio-advanced',
    enabled: true,
    description: 'Advanced portfolio with trading capabilities',
    rolloutPercentage: 50,
  },
  'realtime-dashboard': {
    key: 'realtime-dashboard',
    enabled: true,
    description: 'Real-time dashboard with live metrics',
    rolloutPercentage: 80,
  },
  'shared-account-manager': {
    key: 'shared-account-manager',
    enabled: true,
    description: 'Collaborative account management',
    rolloutPercentage: 60,
  },
  'advanced-analytics': {
    key: 'advanced-analytics',
    enabled: true,
    description: 'Advanced analytics dashboard',
    rolloutPercentage: 70,
  },
  'biometric-auth': {
    key: 'biometric-auth',
    enabled: false,
    description: 'Biometric authentication (fingerprint/face ID)',
    rolloutPercentage: 0,
  },
  'voice-commands': {
    key: 'voice-commands',
    enabled: false,
    description: 'Voice command navigation',
    rolloutPercentage: 0,
  },
  'ai-insights': {
    key: 'ai-insights',
    enabled: false,
    description: 'AI-powered financial insights',
    rolloutPercentage: 0,
  },
  'dark-mode': {
    key: 'dark-mode',
    enabled: true,
    description: 'Dark mode support',
    rolloutPercentage: 100,
  },
  'compact-mode': {
    key: 'compact-mode',
    enabled: true,
    description: 'Compact UI mode for power users',
    rolloutPercentage: 40,
  },
  'animations': {
    key: 'animations',
    enabled: true,
    description: 'UI animations and transitions',
    rolloutPercentage: 100,
  },
  'reduced-motion': {
    key: 'reduced-motion',
    enabled: true,
    description: 'Respect reduced motion preference',
    rolloutPercentage: 100,
  },
  'push-notifications': {
    key: 'push-notifications',
    enabled: true,
    description: 'Push notifications for transactions',
    rolloutPercentage: 100,
  },
  'email-notifications': {
    key: 'email-notifications',
    enabled: true,
    description: 'Email notifications for important events',
    rolloutPercentage: 100,
  },
  'sms-notifications': {
    key: 'sms-notifications',
    enabled: true,
    description: 'SMS notifications for critical alerts',
    rolloutPercentage: 80,
  },
  'beta-features': {
    key: 'beta-features',
    enabled: false,
    description: 'Access to beta features',
    rolloutPercentage: 10,
  },
  'debug-mode': {
    key: 'debug-mode',
    enabled: false,
    description: 'Debug mode with verbose logging',
    rolloutPercentage: 5,
  },
  'new-dashboard-layout': {
    key: 'new-dashboard-layout',
    enabled: false,
    description: 'Experimental dashboard layout',
    rolloutPercentage: 20,
  },
  'ai-categorization': {
    key: 'ai-categorization',
    enabled: false,
    description: 'AI-powered transaction categorization',
    rolloutPercentage: 15,
  },
  'smart-budgeting': {
    key: 'smart-budgeting',
    enabled: false,
    description: 'AI-powered budget recommendations',
    rolloutPercentage: 20,
  },
  'voice-commands': {
    key: 'voice-commands',
    enabled: false,
    description: 'Voice command support',
    rolloutPercentage: 5,
  },
};

interface FeatureFlagProviderProps {
  children: ReactNode;
  initialFlags?: Record<string, FeatureFlag>;
  userId?: string;
  environment?: string;
  onFlagChange?: (key: string, enabled: boolean) => void;
}

export function FeatureFlagProvider({ 
  children, 
  initialFlags = {},
  userId,
  environment = 'production',
  onFlagChange 
}: FeatureFlagProviderProps) {
  const [flags, setFlags] = useState<Record<string, FeatureFlag>>(() => {
    const stored = localStorage.getItem('feature-flags');
    if (stored) {
      try {
        return { ...DEFAULT_FLAGS, ...JSON.parse(stored), ...initialFlags };
      } catch {
        return { ...DEFAULT_FLAGS, ...initialFlags };
      }
    }
    return { ...DEFAULT_FLAGS, ...initialFlags };
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Persist flags to localStorage
  useEffect(() => {
    localStorage.setItem('feature-flags', JSON.stringify(flags));
  }, [flags]);

  // Check if flag is enabled for user
  const isEnabled = useCallback((key: string, checkUserId?: string): boolean => {
    const flag = flags[key];
    if (!flag) return false;
    if (!flag.enabled) return false;

    // Check environment
    if (flag.environments && !flag.environments.includes(environment)) {
      return false;
    }

    // Check rollout percentage
    if (flag.rolloutPercentage !== undefined && flag.rolloutPercentage < 100) {
      const targetUserId = checkUserId || userId || 'anonymous';
      const hash = hashString(key + targetUserId);
      const percentage = (hash % 100) + 1;
      if (percentage > flag.rolloutPercentage) {
        return false;
      }
    }

    // Check target users
    if (flag.targetUsers && flag.targetUsers.length > 0) {
      const targetUserId = checkUserId || userId;
      if (!targetUserId || !flag.targetUsers.includes(targetUserId)) {
        return false;
      }
    }

    // Check dependencies
    if (flag.dependencies && flag.dependencies.length > 0) {
      for (const dep of flag.dependencies) {
        if (!flags[dep]?.enabled) {
          return false;
        }
      }
    }

    return true;
  }, [flags, userId, environment]);

  const enable = useCallback((key: string) => {
    setFlags(prev => {
      const flag = prev[key];
      if (!flag) return prev;
      const newFlags = { ...prev, [key]: { ...flag, enabled: true } };
      onFlagChange?.(key, true);
      return newFlags;
    });
  }, [onFlagChange]);

  const disable = useCallback((key: string) => {
    setFlags(prev => {
      const flag = prev[key];
      if (!flag) return prev;
      const newFlags = { ...prev, [key]: { ...flag, enabled: false } };
      onFlagChange?.(key, false);
      return newFlags;
    });
  }, [onFlagChange]);

  const toggle = useCallback((key: string) => {
    const flag = flags[key];
    if (!flag) return;
    if (flag.enabled) {
      disable(key);
    } else {
      enable(key);
    }
  }, [flags, enable, disable]);

  const getFlag = useCallback((key: string): FeatureFlag | undefined => {
    return flags[key];
  }, [flags]);

  const refreshFlags = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // In real app, fetch from API
      // const response = await api.getFeatureFlags(userId, environment);
      // setFlags(prev => ({ ...prev, ...response.data }));
      await new Promise(resolve => setTimeout(resolve, 500));
      setLoading(false);
    } catch (error) {
      setError(error instanceof Error ? error : new Error('Failed to refresh flags'));
      setLoading(false);
    }
  }, [userId, environment]);

  const value = {
    flags,
    isEnabled,
    enable,
    disable,
    toggle,
    getFlag,
    refreshFlags,
    loading,
    error,
  };

  return (
    <FeatureFlagsContext.Provider value={value}>
      {children}
    </FeatureFlagsContext.Provider>
  );
}

export function useFeatureFlags(): FeatureFlagsContextType {
  const context = useContext(FeatureFlagsContext);
  if (!context) {
    throw new Error('useFeatureFlags must be used within a FeatureFlagProvider');
  }
  return context;
}

export function useFeatureFlag(key: string): boolean {
  const { isEnabled } = useFeatureFlags();
  return isEnabled(key);
}

export function useFeatureFlagWithUser(key: string, userId: string): boolean {
  const { isEnabled } = useFeatureFlags();
  return isEnabled(key, userId);
}

// Hook for conditional rendering based on feature flag
export function useFeatureFlagRender(key: string, userId?: string): boolean {
  return useFeatureFlagWithUser(key, userId || '');
}

// Component for conditional rendering
export function FeatureFlagGate({ 
  flag, 
  children, 
  fallback = null,
  userId 
}: { 
  flag: string; 
  children: ReactNode; 
  fallback?: ReactNode; 
  userId?: string;
}) {
  const isEnabled = useFeatureFlagWithUser(flag, userId);
  return isEnabled ? children : fallback;
}

// Hook for multiple feature flags
export function useFeatureFlags(keys: string[]): Record<string, boolean> {
  const { isEnabled } = useFeatureFlags();
  const result: Record<string, boolean> = {};
  keys.forEach(key => {
    result[key] = isEnabled(key);
  });
  return result;
}

// Hook for feature flag metadata
export function useFeatureFlagMetadata(key: string): FeatureFlag | undefined {
  const { getFlag } = useFeatureFlags();
  return getFlag(key);
}

// Feature flag debug panel component
export function FeatureFlagDebugPanel() {
  const { flags, isEnabled, enable, disable, toggle, loading } = useFeatureFlags();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'enabled' | 'disabled' | 'beta'>('all');

  const filteredFlags = Object.entries(flags)
    .filter(([key, flag]) => {
      if (search && !key.toLowerCase().includes(search.toLowerCase()) && 
          !flag.description?.toLowerCase().includes(search.toLowerCase())) {
        return false;
      }
      if (filter === 'enabled' && !flag.enabled) return false;
      if (filter === 'disabled' && flag.enabled) return false;
      if (filter === 'beta' && flag.rolloutPercentage !== undefined && flag.rolloutPercentage < 100) return true;
      if (filter === 'beta' && (flag.rolloutPercentage === undefined || flag.rolloutPercentage === 100)) return false;
      return true;
    })
    .sort(([a], [b]) => a.localeCompare(b));

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">Feature Flags</h2>
        <div className="flex items-center gap-2">
          <Input
            placeholder="Search flags..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-64"
          />
          <Select value={filter} onValueChange={setFilter} className="w-40">
            <SelectTrigger className="w-full"><SelectValue placeholder="Filter" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="enabled">Enabled</SelectItem>
              <SelectItem value="disabled">Disabled</SelectItem>
              <SelectItem value="beta">Beta/Rollout</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => {}} disabled={loading}>
            <RefreshCw className="w-4 h-4 mr-2" /> Refresh
          </Button>
        </div>
      </div>

      <div className="space-y-2 max-h-[600px] overflow-y-auto">
        {Object.entries(flags)
          .filter(([key]) => {
            if (search && !key.toLowerCase().includes(search.toLowerCase())) return false;
            if (filter === 'enabled' && !flags[key].enabled) return false;
            if (filter === 'disabled' && flags[key].enabled) return false;
            return true;
          })
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, flag]) => (
            <div key={key} className="flex items-center justify-between p-4 rounded-lg border border-border bg-card hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3">
                  <span className={cn(
                    'font-medium text-text',
                    flags[key].enabled ? '' : 'text-muted line-through'
                  )}>
                    {key}
                  </span>
                  {flags[key].rolloutPercentage !== undefined && flags[key].rolloutPercentage < 100 && (
                    <Badge variant="outline" className="ml-2 text-xs">
                      {flags[key].rolloutPercentage}% rollout
                    </Badge>
                  )}
                  {flags[key].metadata?.beta && (
                    <Badge variant="secondary" className="ml-2 text-xs">Beta</Badge>
                  )}
                  {flags[key].metadata?.experimental && (
                    <Badge variant="destructive" className="ml-2 text-xs">Experimental</Badge>
                  )}
                </div>
                <div className="flex items-center gap-2 text-sm text-muted">
                  <span className="text-xs text-muted">{flags[key].rolloutPercentage !== undefined ? `${flags[key].rolloutPercentage}%` : '100%'}</span>
                  {flags[key].dependencies && flags[key].dependencies.length > 0 && (
                    <span className="text-xs text-muted">Deps: {flags[key].dependencies!.join(', ')}</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={flags[key].enabled}
                    onCheckedChange={(checked) => checked ? enable(key) : disable(key)}
                    disabled={loading}
                  />
                </div>
              </div>
            ))}
          )}
        </div>
      </div>
    );
  }

  return null;
}

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

export { FeatureFlagProvider, useFeatureFlags, useFeatureFlag, useFeatureFlagWithUser, useFeatureFlagRender, useFeatureFlags, useFeatureFlagMetadata, FeatureFlagGate };
export type { FeatureFlag };