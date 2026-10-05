import { useState, useEffect, useCallback } from 'react';
import { 
  TrendingUp, TrendingDown, DollarSign, CreditCard, 
  ArrowUpRight, ArrowDownLeft, RefreshCw, 
  Activity, Zap, BarChart3, PieChart
} from 'lucide-react';
import { formatCurrency, formatRelativeTime } from '../../utils/format';
import { Card, CardContent, Badge, Skeleton, SkeletonStatCard } from '../ui';
import { cn } from '../../utils/cn';

interface RealtimeMetric {
  label: string;
  value: string;
  change: number;
  trend: 'up' | 'down' | 'neutral';
  icon: React.ReactNode;
  color: string;
}

interface TransactionFeedItem {
  id: string;
  type: string;
  amount: number;
  account: string;
  timestamp: string;
  status: string;
}

export function RealtimeBalanceWidget({ 
  initialBalance = 0, 
  onRefresh 
}: { 
  initialBalance?: number; 
  onRefresh?: () => void 
}) {
  const [balance, setBalance] = useState(initialBalance);
  const [change, setChange] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      // In a real app, this would fetch from an API
      // const response = await fetch('/api/accounts/balance');
      // const data = await response.json();
      // setBalance(data.balance);
      // setChange(data.change);
      
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 500));
      const newBalance = initialBalance + (Math.random() - 0.5) * 1000;
      setBalance(Math.max(0, newBalance));
      setChange(newBalance - initialBalance);
      setLastUpdated(new Date());
      onRefresh?.();
    } catch (error) {
      console.error('Failed to refresh balance:', error);
    } finally {
      setIsLoading(false);
    }
  }, [initialBalance, onRefresh]);

  useEffect(() => {
    const interval = setInterval(refresh, 30000); // Auto-refresh every 30 seconds
    return () => clearInterval(interval);
  }, [refresh]);

  return (
    <Card className="hover:shadow-card-hover transition-shadow duration-200">
      <CardContent className="flex items-center justify-between p-6">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <div className={cn(
              'w-10 h-10 rounded-xl flex items-center justify-center',
              change >= 0 ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'
            )}>
              <DollarSign className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-medium text-muted">Available Balance</h3>
            {isLoading && <span className="animate-pulse w-4 h-4 bg-slate-200 rounded" />}
          </div>
          <div className="flex items-baseline gap-2">
            <p className="text-3xl font-bold text-text">{formatCurrency(balance)}</p>
            <span className={cn(
              'text-sm font-medium',
              change >= 0 ? 'text-green-600' : 'text-red-600'
            )}>
              {change >= 0 ? '+' : ''}{formatCurrency(change)}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={refresh} 
            isLoading={isLoading}
            leftIcon={<RefreshCw className="w-4 h-4" />}
            className="text-muted hover:text-primary-600"
          >
            Refresh
          </Button>
          <span className="text-xs text-muted">
            Updated {formatRelativeTime(lastUpdated)}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

export function RealtimeTransactionFeed({ 
  transactions = [], 
  maxItems = 5,
  onLoadMore 
}: { 
  transactions?: TransactionFeedItem[]; 
  maxItems?: number;
  onLoadMore?: () => void 
}) {
  return (
    <Card>
      <CardContent className="p-0">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h3 className="font-semibold text-text">Recent Activity</h3>
          {onLoadMore && (
            <Button variant="ghost" size="sm" onClick={onLoadMore}>
              View All
            </Button>
          )}
        </div>
        <div className="divide-y divide-border">
          {transactions.length === 0 ? (
            <div className="p-8 text-center">
              <Activity className="w-12 h-12 text-muted mx-auto mb-3" />
              <p className="text-muted">No recent transactions</p>
            </div>
          ) : (
            transactions.slice(0, maxItems).map((txn) => (
              <div key={txn.id} className="p-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors flex items-center gap-4">
                <div className={cn(
                  'w-10 h-10 rounded-lg flex items-center justify-center',
                  txn.type.includes('DEPOSIT') || txn.type.includes('TRANSFER_IN') ? 'bg-green-100 text-green-600' :
                  txn.type.includes('WITHDRAWAL') || txn.type.includes('TRANSFER_OUT') ? 'bg-red-100 text-red-600' :
                  txn.type.includes('LOAN') ? 'bg-purple-100 text-purple-600' :
                  'bg-blue-100 text-blue-600'
                )}>
                  {txn.type.includes('DEPOSIT') && <ArrowDownLeft className="w-5 h-5" />}
                  {txn.type.includes('WITHDRAWAL') && <ArrowUpRight className="w-5 h-5" />}
                  {txn.type.includes('TRANSFER') && <ArrowRightLeft className="w-5 h-5" />}
                  {txn.type.includes('LOAN') && <CreditCard className="w-5 h-5" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-text truncate">{txn.type.replace('_', ' ')}</p>
                  <p className="text-sm text-muted truncate">{txn.account}</p>
                </div>
                <div className="text-right">
                  <p className={cn(
                    'font-medium',
                    txn.type.includes('DEPOSIT') || txn.type.includes('TRANSFER_IN') ? 'text-green-600' : 'text-red-600'
                  )}>
                    {txn.type.includes('DEPOSIT') || txn.type.includes('TRANSFER_IN') ? '+' : '-'}
                    {formatCurrency(txn.amount)}
                  </p>
                  <p className="text-xs text-muted">{formatRelativeTime(txn.timestamp)}</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-6">
            <SkeletonList items={maxItems} />
          </div>
        )}
        {onLoadMore && transactions.length >= maxItems && (
          <div className="p-4 border-t border-border text-center">
            <Button variant="ghost" size="sm" onClick={onLoadMore}>
              Load More Transactions
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function RealtimeStatsGrid({ 
  metrics = [], 
  isLoading = false 
}: { 
  metrics?: RealtimeMetric[]; 
  isLoading?: boolean 
}) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1,2,3,4].map(i => <SkeletonStatCard key={i} />)}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {metrics.map((metric, index) => (
        <Card key={index} className="hover:shadow-card-hover transition-shadow duration-200">
          <CardContent className="flex items-center justify-between p-6">
            <div>
              <p className="text-sm text-muted">{metric.label}</p>
              <p className="text-2xl font-bold text-text mt-1">{metric.value}</p>
              <div className="flex items-center gap-1 mt-1">
                <span className={cn(
                  'text-sm font-medium',
                  metric.trend === 'up' ? 'text-green-600' : 
                  metric.trend === 'down' ? 'text-red-600' : 'text-muted'
                )}>
                  {metric.trend === 'up' && <TrendingUp className="w-4 h-4" />}
                  {metric.trend === 'down' && <TrendingDown className="w-4 h-4" />}
                  {Math.abs(metric.change).toFixed(1)}%
                </span>
                <span className="text-xs text-muted">vs last period</span>
              </div>
            </div>
            <div className={cn(
              'w-12 h-12 rounded-xl flex items-center justify-center',
              metric.color
            )}>
              {metric.icon}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function LiveIndicator({ isLive = true, label = 'Live' }) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium',
      isLive 
        ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' 
        : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
    )}>
      {isLive && (
        <span className="relative">
          <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
        </span>
      )}
      {label}
    </span>
  );
}

export function ConnectionStatus({ 
  status = 'connected', 
  onReconnect 
}: { 
  status: 'connected' | 'connecting' | 'disconnected' | 'error';
  onReconnect?: () => void 
}) {
  const statusConfig = {
    connected: { 
      label: 'Connected', 
      color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
      icon: <Zap className="w-3 h-3" />
    },
    connecting: { 
      label: 'Connecting...', 
      color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300',
      icon: <span className="animate-spin w-3 h-3 border-2 border-current border-t-transparent rounded-full" />
    },
    disconnected: { 
      label: 'Disconnected', 
      color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
      icon: <Zap className="w-3 h-3 opacity-50" />
    },
    error: { 
      label: 'Error', 
      color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
      icon: <AlertCircle className="w-3 h-3" />
    },
  };

  const config = statusConfig[status];

  return (
    <div className="flex items-center gap-2">
      <span className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium',
        config.color
      )}>
        {config.icon}
        {config.label}
      </span>
      {status !== 'connected' && onReconnect && (
        <Button variant="ghost" size="sm" onClick={onReconnect} className="h-6 px-2">
          Reconnect
        </Button>
      )}
    </div>
  );
}

// Import TransactionFeedItem type
import { TransactionFeedItem } from '../../types';