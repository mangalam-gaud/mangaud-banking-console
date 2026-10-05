import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { 
  TrendingUp, TrendingDown, DollarSign, CreditCard, 
  ArrowUpRight, ArrowDownLeft, RefreshCw, 
  Activity, Zap, BarChart3, PieChart, Target, 
  Filter, Download, Calendar, Clock, AlertTriangle,
  CheckCircle, XCircle, Info, Zap as ZapIcon,
  ChevronLeft, ChevronRight, Maximize2, Minimize2,
  Settings, Search, X
} from 'lucide-react';
import { cn } from '../../utils/cn';
import { formatCurrency, formatRelativeTime, formatDate, formatNumber } from '../../utils/format';
import { 
  Card, CardContent, CardHeader, CardTitle, CardDescription, Badge, 
  Button, Input, Select, Tabs, TabsList, TabsTrigger, TabsContent,
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
  Modal, Progress, Avatar, AvatarImage, AvatarFallback,
  Tooltip, TooltipTrigger, TooltipContent, SelectTrigger, SelectValue,
  SelectContent, SelectItem, Skeleton
} from '../ui';
import { 
  BarChartComponent, 
  LineChartComponent, 
  PieChartComponent, 
  ComposedChartComponent, 
  MetricCard,
  SparklineChart,
  RealtimeMetric
} from '../charts';
import { useAdvancedCache, useWebSocket, useNotifications } from '../../hooks';
import { Transaction, Account } from '../../types';
import { useDebounce, useVirtualizedList, useMediaQuery } from '../../hooks';
import { format } from 'date-fns';
import toast from 'react-hot-toast';

interface AnalyticsFilters {
  dateRange: '7d' | '30d' | '90d' | '1y' | 'custom';
  startDate: string;
  endDate: string;
  accountIds: string[];
  transactionTypes: string[];
  categories: string[];
  amountRange: [number, number];
}

interface AnalyticsData {
  summary: {
    totalIncome: number;
    totalExpense: number;
    netFlow: number;
    savingsRate: number;
    transactionCount: number;
    avgTransaction: number;
    largestExpense: number;
    largestIncome: number;
  };
  trends: Array<{
    period: string;
    income: number;
    expense: number;
    net: number;
    savingsRate: number;
  }>;
  categoryBreakdown: Array<{
    category: string;
    amount: number;
    percentage: number;
    count: number;
    trend: 'up' | 'down' | 'stable';
  }>;
  accountPerformance: Array<{
    accountId: string;
    accountNumber: string;
    accountType: string;
    balance: number;
    income: number;
    expense: number;
    netFlow: number;
    transactionCount: number;
  }>;
  monthlyComparison: Array<{
    month: string;
    thisYear: number;
    lastYear: number;
    change: number;
  }>;
  cashFlowForecast: Array<{
    date: string;
    projectedBalance: number;
    confidence: number;
  }>;
  topMerchants: Array<{
    merchant: string;
    amount: number;
    count: number;
    category: string;
  }>;
  recurringExpenses: Array<{
    merchant: string;
    amount: number;
    frequency: string;
    nextDate: string;
    category: string;
  }>;
}

export function AdvancedAnalyticsDashboard() {
  const { accounts, transactions, isLoading: storeLoading } = useAccountStore();
  const { toast } = useToastNotifications();
  const isMobile = useIsMobile();

  // Filters state
  const [filters, setFilters] = useState<AnalyticsFilters>({
    dateRange: '30d',
    startDate: '',
    endDate: '',
    accountIds: [],
    transactionTypes: [],
    categories: [],
    amountRange: [0, 1000000],
  });

  // UI state
  const [activeTab, setActiveTab] = useState<'overview' | 'spending' | 'income' | 'cashflow' | 'forecast' | 'merchants'>('overview');
  const [selectedAccount, setSelectedAccount] = useState<string>('');
  const [showFilters, setShowFilters] = useState(false);
  const [exportFormat, setExportFormat] = useState<'csv' | 'pdf' | 'excel'>('csv');
  const [isExporting, setIsExporting] = useState(false);
  const [selectedMetric, setSelectedMetric] = useState<string | null>(null);

  // Real-time data
  const { 
    notifications: wsNotifications, 
    addNotification,
    unreadCount 
  } = useNotifications();

  // Advanced caching for analytics
  const { 
    data: cachedAnalytics, 
    refresh: refreshAnalytics,
    loading: analyticsLoading,
    stale 
  } = useAdvancedCache<AnalyticsData>(
    `analytics-${JSON.stringify(filters)}`,
    async () => {
      // In real app, fetch from API with filters
      return generateMockAnalyticsData(filters, accounts, transactions);
    },
    { ttl: 60000, staleWhileRevalidate: 30000 }
  );

  // WebSocket for real-time updates
  const { 
    isConnected, 
    lastMessage,
    sendMessage: sendWSMessage 
  } = useWebSocketJSON<{ type: string; data: any }>({
    url: import.meta.env.VITE_WS_URL || 'ws://localhost:5000/ws/analytics',
    onMessage: (event) => {
      const message = event.data;
      if (message.type === 'transaction_update') {
        // Invalidate cache to refresh
        // In real app, would update specific data points
        toast.success('New transaction received');
      }
    },
  });

  const debouncedFilters = useDebounce(filters, 500);

  // Generate analytics data
  const analyticsData = useMemo(() => {
    if (cachedAnalytics) return cachedAnalytics;
    return generateMockAnalyticsData(filters, accounts, transactions);
  }, [cachedAnalytics, filters, accounts, transactions]);

  // Virtualized list for large datasets
  const { 
    items: displayedTransactions, 
    loadMore, 
    hasMore, 
    isLoading: virtualLoading,
    observerTargetRef,
    reset: resetVirtualList
  } = useVirtualizedList<Transaction>({
    items: transactions,
    itemHeight: 80,
    containerHeight: 500,
    loadMore: async () => {
      // Load more logic
      return [];
    },
    hasMore: false,
    isLoading: false,
    threshold: 200,
  });

  const handleFilterChange = useCallback((key: keyof AnalyticsFilters, value: any) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  }, []);

  const handleDateRangeChange = useCallback((range: AnalyticsFilters['dateRange']) => {
    setFilters(prev => {
      const newFilters = { ...prev, dateRange: range };
      if (range !== 'custom') {
        const end = new Date();
        const start = new Date();
        const days = range === '7d' ? 7 : range === '30d' ? 30 : range === '90d' ? 90 : 365;
        start.setDate(start.getDate() - days);
        newFilters.startDate = start.toISOString().split('T')[0];
        newFilters.endDate = end.toISOString().split('T')[0];
      }
      return newFilters;
    });
  }, []);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      // Generate export based on format
      let content = '';
      let filename = '';
      let mimeType = '';

      if (exportFormat === 'csv') {
        // Generate CSV
        const headers = ['Date', 'Type', 'Amount', 'Category', 'Account', 'Description'];
        const rows = analyticsData.summary ? [] : []; // Would use actual transaction data
        content = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n');
        filename = `analytics-${filters.dateRange}-${Date.now()}.csv`;
        mimeType = 'text/csv';
      } else if (exportFormat === 'excel') {
        toast.error('Excel export coming soon');
        return;
      } else {
        toast.error('PDF export coming soon');
        return;
      }

      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success(`${exportFormat.toUpperCase()} exported successfully`);
    } catch (error) {
      toast.error('Export failed');
    } finally {
      setIsExporting(false);
    }
  };

  const handleDrillDown = (metric: string, data: any) => {
    setSelectedMetric(metric);
    // Open detail modal or navigate to detail view
  };

  return (
    <div className="space-y-6">
      {/* Header with Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text">Analytics Dashboard</h1>
          <p className="text-muted mt-1">Deep insights into your financial data</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2">
            <Select value={filters.dateRange} onValueChange={handleDateRangeChange} className="w-40">
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Date Range" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7d">Last 7 Days</SelectItem>
                <SelectItem value="30d">Last 30 Days</SelectItem>
                <SelectItem value="90d">Last 90 Days</SelectItem>
                <SelectItem value="1y">Last Year</SelectItem>
                <SelectItem value="custom">Custom Range</SelectItem>
              </SelectContent>
            </Select>
            {filters.dateRange === 'custom' && (
              <div className="flex items-center gap-2">
                <Input type="date" value={filters.startDate} onChange={(e) => setFilters(p => ({ ...p, startDate: e.target.value }))} className="w-36" />
                <span className="text-muted">to</span>
                <Input type="date" value={filters.endDate} onChange={(e) => setFilters(p => ({ ...p, endDate: e.target.value }))} className="w-36" />
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Select value={filters.accountIds.join(',')} onValueChange={(v) => setFilters(p => ({ ...p, accountIds: v.split(',').filter(Boolean) }))} className="w-40" multiple>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="All Accounts" />
              </SelectTrigger>
              <SelectContent>
                {accounts.map(acc => (
                  <SelectItem key={acc.id} value={acc.id}>
                    {acc.accountType} - {acc.accountNumber}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => setShowFilters(!showFilters)}
              leftIcon={<Filter className="w-4 h-4" />}
            >
              Filters
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleExport}
              isLoading={isExporting}
              leftIcon={<Download className="w-4 h-4" />}
            >
              Export
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => refreshAnalytics()}
              isLoading={analyticsLoading}
              leftIcon={<RefreshCw className="w-4 h-4" />}
            >
              Refresh
            </Button>
          </div>
        </div>
      </div>

      {/* Connection Status & Live Indicator */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <LiveIndicator isLive={isConnected} label="Live Data" />
          <ConnectionStatus status={isConnected ? 'connected' : 'disconnected'} />
          {stale && (
            <Badge variant="warning" className="flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              Stale Data
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <select 
            value={activeTab} 
            onChange={(e) => setActiveTab(e.target.value as any)}
            className="input w-auto py-1.5"
          >
            <option value="overview">Overview</option>
            <option value="spending">Spending</option>
            <option value="income">Income</option>
            <option value="cashflow">Cash Flow</option>
            <option value="forecast">Forecast</option>
            <option value="merchants">Merchants</option>
          </select>
        </div>
      </div>

      {/* Key Metrics Grid */}
      <RealtimeStatsGrid 
        metrics={[
          {
            label: 'Total Income',
            value: formatCurrency(analyticsData.summary.totalIncome),
            change: 12.5,
            trend: 'up',
            icon: <ArrowUpRight className="w-5 h-5" />,
            color: 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400',
          },
          {
            label: 'Total Expense',
            value: formatCurrency(analyticsData.summary.totalExpense),
            change: -8.3,
            trend: 'down',
            icon: <ArrowDownLeft className="w-5 h-5" />,
            color: 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400',
          },
          {
            label: 'Net Flow',
            value: formatCurrency(analyticsData.summary.netFlow),
            change: analyticsData.summary.netFlow > 0 ? 15.2 : -8.7,
            trend: analyticsData.summary.netFlow > 0 ? 'up' : 'down',
            icon: <TrendingUp className="w-5 h-5" />,
            color: analyticsData.summary.netFlow > 0 
              ? 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400'
              : 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400',
          },
          {
            label: 'Savings Rate',
            value: `${analyticsData.summary.savingsRate.toFixed(1)}%`,
            change: 2.1,
            trend: 'up',
            icon: <Target className="w-5 h-5" />,
            color: 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
          },
        ]} 
        isLoading={analyticsLoading} 
      />

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-2 md:grid-cols-6 gap-2">
          {[
            { value: 'overview', label: 'Overview', icon: Activity },
            { value: 'spending', label: 'Spending', icon: ArrowDownLeft },
            { value: 'income', label: 'Income', icon: ArrowUpRight },
            { value: 'cashflow', label: 'Cash Flow', icon: DollarSign },
            { value: 'forecast', label: 'Forecast', icon: TrendingUp },
            { value: 'merchants', label: 'Merchants', icon: Target },
          ].map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value} className="flex items-center gap-2">
              <tab.icon className="w-4 h-4" />
              <span className="hidden sm:inline">{tab.label}</span>
            </TabsTrigger>
          ))}
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Income vs Expense Trend */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Income vs Expense Trend</CardTitle>
                <CardDescription>Monthly comparison over the selected period</CardDescription>
              </CardHeader>
              <CardContent>
                <ComposedChartComponent
                  data={analyticsData.trends.map(t => ({
                    month: t.period,
                    income: t.income,
                    expense: t.expense,
                    net: t.net,
                    savingsRate: t.savingsRate,
                  }))}
                  xKey="month"
                  bars={[{ key: 'income', color: '#16a34a', name: 'Income' }]}
                  lines={[
                    { key: 'expense', color: '#dc2626', name: 'Expense' },
                    { key: 'net', color: '#2563eb', name: 'Net Flow' }
                  ]}
                  height={350}
                />
              </CardContent>
            </Card>

            {/* Category Breakdown */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Spending by Category</CardTitle>
                <CardDescription>Breakdown of expenses by category</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="lg:col-span-1">
                    <PieChartComponent
                      data={analyticsData.categoryBreakdown.map(c => ({
                        name: c.category,
                        value: c.amount,
                      }))}
                      title="Expense Distribution"
                      height={300}
                    />
                  </div>
                  <div className="lg:col-span-1 space-y-3">
                    {analyticsData.categoryBreakdown.slice(0, 10).map((cat, i) => (
                      <div key={cat.category} className="flex items-center justify-between p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50">
                        <div className="flex items-center gap-3">
                          <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center', 
                            cat.trend === 'up' ? 'bg-green-100 text-green-600' :
                            cat.trend === 'down' ? 'bg-red-100 text-red-600' :
                            'bg-gray-100 text-gray-600'
                          )}>
                            {cat.trend === 'up' && <TrendingUp className="w-4 h-4" />}
                            {cat.trend === 'down' && <TrendingDown className="w-4 h-4" />}
                            {cat.trend === 'stable' && <Minus className="w-4 h-4" />}
                          </div>
                          <div>
                            <p className="font-medium text-text">{cat.category}</p>
                            <p className="text-xs text-muted">{cat.count} transactions</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold text-text">{formatCurrency(cat.amount)}</p>
                          <p className="text-xs text-muted">{cat.percentage.toFixed(1)}%</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Second Row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Account Performance */}
            <Card className="lg:col-span-2">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Account Performance</CardTitle>
                  <CardDescription>Balance, flow, and activity by account</CardDescription>
                </div>
                <Select 
                  value={selectedAccount} 
                  onValueChange={setSelectedAccount}
                  options={[
                    { value: '', label: 'All Accounts' },
                    ...accounts.map(a => ({ value: a.id, label: `${a.accountType} - ${a.accountNumber}` })),
                  ]}
                  className="w-48"
                />
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Account</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead className="text-right">Balance</TableHead>
                        <TableHead className="text-right">Income</TableHead>
                        <TableHead className="text-right">Expense</TableHead>
                        <TableHead className="text-right">Net Flow</TableHead>
                        <TableHead>Transactions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {analyticsData.accountPerformance
                        .filter(a => !selectedAccount || a.accountId === selectedAccount)
                        .map((acc) => (
                          <TableRow key={acc.accountId} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center',
                                  acc.accountType === 'SAVINGS' ? 'bg-blue-100 text-blue-600' :
                                  acc.accountType === 'CURRENT' ? 'bg-green-100 text-green-600' :
                                  'bg-purple-100 text-purple-600'
                                )}>
                                  {acc.accountType === 'SAVINGS' && <CreditCard className="w-4 h-4" />}
                                  {acc.accountType === 'CURRENT' && <Building2 className="w-4 h-4" />}
                                  {acc.accountType === 'SALARY' && <DollarSign className="w-4 h-4" />}
                                </div>
                                <span className="font-mono text-sm">{acc.accountNumber}</span>
                              </div>
                            </TableCell>
                            <TableCell><Badge variant="default">{acc.accountType}</Badge></TableCell>
                            <TableCell className="text-right font-medium">{formatCurrency(acc.balance)}</TableCell>
                            <TableCell className="text-right text-green-600">+{formatCurrency(acc.income)}</TableCell>
                            <TableCell className="text-right text-red-600">-{formatCurrency(acc.expense)}</TableCell>
                            <TableCell className="text-right font-semibold">
                              {acc.netFlow >= 0 ? '+' : '-'}{formatCurrency(Math.abs(acc.netFlow))}
                            </TableCell>
                            <TableCell>{acc.transactionCount}</TableCell>
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            {/* Monthly Comparison */}
            <Card>
              <CardHeader>
                <CardTitle>Year-over-Year Comparison</CardTitle>
                <CardDescription>Monthly spending vs last year</CardDescription>
              </CardHeader>
              <CardContent>
                <ComposedChartComponent
                  data={analyticsData.monthlyComparison}
                  xKey="month"
                  bars={[{ key: 'lastYear', color: '#94a3b8', name: 'Last Year' }]}
                  lines={[{ key: 'thisYear', color: '#2563eb', name: 'This Year' }]}
                  height={300}
                />
              </CardContent>
            </Card>
          </div>

          {/* Cash Flow Forecast */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Cash Flow Forecast</CardTitle>
                <CardDescription>Projected balance based on recurring patterns</CardDescription>
              </CardHeader>
              <CardContent>
                <ComposedChartComponent
                  data={analyticsData.cashFlowForecast.map((f, i) => ({
                    date: f.date,
                    projected: f.projectedBalance,
                    confidence: f.confidence,
                  }))}
                  xKey="date"
                  lines={[
                    { key: 'projected', color: '#2563eb', name: 'Projected Balance' },
                  ]}
                  height={300}
                />
                <div className="mt-4 grid grid-cols-3 gap-4 text-sm">
                  <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20">
                    <p className="text-muted">Next 30 Days</p>
                    <p className="font-bold text-text">{formatCurrency(analyticsData.cashFlowForecast[30]?.projectedBalance || 0)}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-green-50 dark:bg-green-900/20">
                    <p className="text-muted">Confidence</p>
                    <p className="font-bold text-text">{Math.round(analyticsData.cashFlowForecast[30]?.confidence || 0)}%</p>
                  </div>
                  <div className="p-3 rounded-lg bg-yellow-50 dark:bg-yellow-900/20">
                    <p className="text-muted">Risk Level</p>
                    <p className="font-bold text-text">
                      {analyticsData.cashFlowForecast[30]?.projectedBalance < 0 ? 'High' : 'Low'}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Top Merchants */}
            <Card>
              <CardHeader>
                <CardTitle>Top Merchants</CardTitle>
                <CardDescription>Where you spend the most</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {analyticsData.topMerchants.slice(0, 10).map((merchant, i) => (
                    <div key={merchant.merchant} className="flex items-center justify-between p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center text-primary-600 dark:text-primary-400">
                          <span className="text-sm font-bold">{i + 1}</span>
                        </div>
                        <div>
                          <p className="font-medium text-text">{merchant.merchant}</p>
                          <p className="text-xs text-muted">{merchant.category} • {merchant.count} transactions</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-text">{formatCurrency(merchant.amount)}</p>
                        <p className="text-xs text-muted">{merchant.count} txns</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Spending Tab */}
        <TabsContent value="spending">
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle>Spending Trend</CardTitle>
                  <CardDescription>Daily spending pattern over time</CardDescription>
                </CardHeader>
                <CardContent>
                  <LineChartComponent
                    data={analyticsData.trends.map(t => ({
                      date: t.period,
                      spending: t.expense,
                      dailyAvg: t.expense / 30,
                    }))}
                    xKey="date"
                    lines={[
                      { key: 'spending', color: '#dc2626', name: 'Daily Spending' },
                      { key: 'dailyAvg', color: '#94a3b8', name: 'Daily Average' },
                    ]}
                    height={350}
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Spending by Day of Week</CardTitle>
                  <CardDescription>Which days you spend the most</CardDescription>
                </CardHeader>
                <CardContent>
                  <BarChartComponent
                    data={[
                      { day: 'Mon', amount: 1200 },
                      { day: 'Tue', amount: 950 },
                      { day: 'Wed', amount: 1100 },
                      { day: 'Thu', amount: 1350 },
                      { day: 'Fri', amount: 1800 },
                      { day: 'Sat', amount: 2200 },
                      { day: 'Sun', amount: 1600 },
                    ]}
                    xKey="day"
                    yKeys={['amount']}
                    colors={['#dc2626']}
                    height={300}
                  />
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Budget vs Actual</CardTitle>
                <CardDescription>Track spending against budgets</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {[
                    { category: 'Food & Dining', budget: 800, spent: 720 },
                    { category: 'Transportation', budget: 300, spent: 280 },
                    { category: 'Shopping', budget: 500, spent: 650 },
                    { category: 'Entertainment', budget: 200, spent: 150 },
                    { category: 'Utilities', budget: 400, spent: 380 },
                  ].map((budget) => {
                    const percentage = (budget.spent / budget.budget) * 100;
                    return (
                      <div key={budget.category} className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-medium">{budget.category}</span>
                          <span className="text-sm text-muted">{percentage.toFixed(0)}%</span>
                        </div>
                        <Progress 
                          value={Math.min(percentage, 100)} 
                          className="h-2"
                          className={percentage > 100 ? 'bg-red-500' : percentage > 80 ? 'bg-yellow-500' : 'bg-green-500'}
                        />
                        <div className="flex justify-between text-xs text-muted">
                          <span>Spent: {formatCurrency(budget.spent)}</span>
                          <span>Budget: {formatCurrency(budget.budget)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Income Tab */}
          <TabsContent value="income">
            <div className="space-y-6">
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle>Income Sources</CardTitle>
                  <CardDescription>Breakdown of income by source</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div>
                      <PieChartComponent
                        data={[
                          { name: 'Salary', value: 65000 },
                          { name: 'Freelance', value: 15000 },
                          { name: 'Investments', value: 8000 },
                          { name: 'Other', value: 2000 },
                        ]}
                        title="Income Sources"
                        height={300}
                      />
                    </div>
                    <div className="space-y-4">
                      {[
                        { source: 'Salary', amount: 65000, frequency: 'Monthly', trend: 'up' },
                        { source: 'Freelance', amount: 15000, frequency: 'Variable', trend: 'up' },
                        { source: 'Investments', amount: 8000, frequency: 'Quarterly', trend: 'stable' },
                        { source: 'Other', amount: 2000, frequency: 'Occasional', trend: 'down' },
                      ].map((income) => (
                        <div key={income.source} className="flex items-center justify-between p-4 rounded-lg bg-slate-50 dark:bg-slate-800/50">
                          <div>
                            <p className="font-medium text-text">{income.source}</p>
                            <p className="text-sm text-muted">{income.frequency}</p>
                          </div>
                          <div className="text-right">
                            <p className="font-bold text-green-600">+{formatCurrency(income.amount)}</p>
                            <p className={cn('text-xs', income.trend === 'up' ? 'text-green-600' : income.trend === 'down' ? 'text-red-600' : 'text-muted')}>
                              {income.trend === 'up' && <TrendingUp className="w-3 h-3 inline" />}
                              {income.trend === 'down' && <TrendingDown className="w-3 h-3 inline" />}
                              {income.trend === 'stable' && <Minus className="w-3 h-3 inline" />}
                              <span className="ml-1">{income.trend === 'up' ? 'Growing' : income.trend === 'down' ? 'Declining' : 'Stable'}</span>
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Income Trend</CardTitle>
                  <CardDescription>Monthly income trend over time</CardDescription>
                </CardHeader>
                <CardContent>
                  <LineChartComponent
                    data={analyticsData.trends.map(t => ({
                      month: t.period,
                      income: t.income,
                      salary: t.income * 0.75,
                      other: t.income * 0.25,
                    }))}
                    xKey="month"
                    lines={[
                      { key: 'income', color: '#16a34a', name: 'Total Income' },
                      { key: 'salary', color: '#2563eb', name: 'Salary' },
                      { key: 'other', color: '#9333ea', name: 'Other Income' },
                    ]}
                    height={300}
                  />
                </CardContent>
              </Card>
            </TabsContent>

            {/* Cash Flow Tab */}
            <TabsContent value="cashflow">
              <div className="space-y-6">
                <Card className="lg:col-span-2">
                  <CardHeader>
                    <CardTitle>Cash Flow Analysis</CardTitle>
                    <CardDescription>Track money in vs money out</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ComposedChartComponent
                      data={analyticsData.trends}
                      xKey="period"
                      bars={[
                        { key: 'income', color: '#16a34a', name: 'Income' },
                        { key: 'expense', color: '#dc2626', name: 'Expense' },
                      ]}
                      lines={[{ key: 'net', color: '#2563eb', name: 'Net Flow' }]}
                      height={350}
                    />
                  </CardContent>
                </Card>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <Card>
                    <CardHeader>
                      <CardTitle>Cash Flow Health</CardTitle>
                      <CardDescription>Key indicators of financial health</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <MetricCard
                          label="Operating Cash Flow"
                          value={formatCurrency(analyticsData.summary.netFlow)}
                          change={12.5}
                          trend="up"
                          icon={<ArrowUpRight className="w-5 h-5" />}
                          color="bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400"
                        />
                        <MetricCard
                          label="Free Cash Flow"
                          value={formatCurrency(analyticsData.summary.netFlow * 0.7)}
                          change={8.3}
                          trend="up"
                          icon={<TrendingUp className="w-5 h-5" />}
                          color="bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400"
                        />
                        <MetricCard
                          label="Cash Conversion"
                          value={`${((analyticsData.summary.netFlow / analyticsData.summary.totalIncome) * 100).toFixed(1)}%`}
                          change={-2.1}
                          trend="down"
                          icon={<Target className="w-5 h-5" />}
                          color="bg-yellow-100 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-400"
                        />
                        <MetricCard
                          label="Liquidity Ratio"
                          value={`${(analyticsData.summary.totalIncome / Math.max(analyticsData.summary.totalExpense, 1)).toFixed(2)}x`}
                          change={5.2}
                          trend="up"
                          icon={<DollarSign className="w-5 h-5" />}
                          color="bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400"
                        />
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>Recurring Expenses</CardTitle>
                      <CardDescription>Regular payments and subscriptions</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {analyticsData.recurringExpenses.map((expense) => (
                          <div key={expense.merchant} className="flex items-center justify-between p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center text-purple-600">
                                <CreditCard className="w-5 h-5" />
                              </div>
                              <div>
                                <p className="font-medium text-text">{expense.merchant}</p>
                                <p className="text-sm text-muted">{expense.category} • {expense.frequency}</p>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="font-semibold text-red-600">-{formatCurrency(expense.amount)}</p>
                              <p className="text-xs text-muted">Next: {formatDate(expense.nextDate)}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              {/* Forecast Tab */}
              <TabsContent value="forecast">
                <div className="space-y-6">
                  <Card className="lg:col-span-2">
                    <CardHeader>
                      <CardTitle>Financial Forecast</CardTitle>
                      <CardDescription>AI-powered predictions based on historical patterns</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <ComposedChartComponent
                        data={analyticsData.cashFlowForecast.map(f => ({
                          date: f.date,
                          projected: f.projectedBalance,
                          upper: f.projectedBalance * (1 + (1 - f.confidence/100)),
                          lower: f.projectedBalance * (1 - (1 - f.confidence/100)),
                        }))}
                        xKey="date"
                        lines={[
                          { key: 'projected', color: '#2563eb', name: 'Projected' },
                          { key: 'upper', color: '#93c5fd', name: 'Upper Bound' },
                          { key: 'lower', color: '#93c5fd', name: 'Lower Bound' },
                        ]}
                        height={350}
                      />
                      <div className="mt-6 grid grid-cols-4 gap-4">
                        <div className="p-4 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200">
                          <p className="text-sm text-muted">30-Day Projection</p>
                          <p className="text-2xl font-bold text-blue-600 dark:text-blue-400 mt-1">
                            {formatCurrency(analyticsData.cashFlowForecast[30]?.projectedBalance || 0)}
                          </p>
                          <p className="text-xs text-muted mt-1">Confidence: {Math.round(analyticsData.cashFlowForecast[30]?.confidence || 0)}%</p>
                        </div>
                        <div className="p-4 rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200">
                          <p className="text-sm text-muted">60-Day Projection</p>
                          <p className="text-2xl font-bold text-green-600 dark:text-green-400 mt-1">
                            {formatCurrency(analyticsData.cashFlowForecast[60]?.projectedBalance || 0)}
                          </p>
                          <p className="text-xs text-muted mt-1">Confidence: {Math.round(analyticsData.cashFlowForecast[60]?.confidence || 0)}%</p>
                        </div>
                        <div className="p-4 rounded-xl bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200">
                          <p className="text-sm text-muted">90-Day Projection</p>
                          <p className="text-2xl font-bold text-yellow-600 dark:text-yellow-400 mt-1">
                            {formatCurrency(analyticsData.cashFlowForecast[90]?.projectedBalance || 0)}
                          </p>
                          <p className="text-xs text-muted mt-1">Confidence: {Math.round(analyticsData.cashFlowForecast[90]?.confidence || 0)}%</p>
                        </div>
                        <div className="p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200">
                          <p className="text-sm text-muted">Risk of Negative Balance</p>
                          <p className="text-2xl font-bold text-red-600 dark:text-red-400 mt-1">
                            {analyticsData.cashFlowForecast.some(f => f.projectedBalance < 0) ? 'High' : 'Low'}
                          </p>
                          <p className="text-xs text-muted mt-1">First risk: {analyticsData.cashFlowForecast.find(f => f.projectedBalance < 0)?.date || 'None'}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <Card>
                      <CardHeader>
                        <CardTitle>Scenario Analysis</CardTitle>
                        <CardDescription>What-if scenarios for planning</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        {[
                          { scenario: 'Best Case', description: 'Income +10%, Expenses -5%', balance: analyticsData.cashFlowForecast[90]?.projectedBalance * 1.15, color: 'green' },
                          { scenario: 'Expected', description: 'Current trends continue', balance: analyticsData.cashFlowForecast[90]?.projectedBalance, color: 'blue' },
                          { scenario: 'Worst Case', description: 'Income -10%, Expenses +10%', balance: analyticsData.cashFlowForecast[90]?.projectedBalance * 0.8, color: 'red' },
                        ].map((scenario) => (
                          <div key={scenario.scenario} className="p-4 rounded-lg border border-border">
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="font-medium text-text">{scenario.scenario}</p>
                                <p className="text-sm text-muted">{scenario.description}</p>
                              </div>
                              <div className="text-right">
                                <p className={cn('font-bold text-xl', scenario.color === 'green' ? 'text-green-600' : scenario.color === 'red' ? 'text-red-600' : 'text-blue-600')}>
                                  {formatCurrency(scenario.balance)}
                                </p>
                                <p className="text-xs text-muted">90-day projection</p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle>Forecast Accuracy</CardTitle>
                        <CardDescription>Historical forecast vs actual performance</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <LineChartComponent
                          data={[
                            { month: 'Jan', forecast: 45000, actual: 44800 },
                            { month: 'Feb', forecast: 46000, actual: 46500 },
                            { month: 'Mar', forecast: 47000, actual: 46800 },
                            { month: 'Apr', forecast: 48000, actual: 48200 },
                            { month: 'May', forecast: 49000, actual: 48900 },
                            { month: 'Jun', forecast: 50000, actual: 50100 },
                          ]}
                          xKey="month"
                          lines={[
                            { key: 'forecast', color: '#2563eb', name: 'Forecast', strokeWidth: 2 },
                            { key: 'actual', color: '#16a34a', name: 'Actual', strokeWidth: 2 },
                          ]}
                          height={250}
                        />
                        <div className="mt-4 flex items-center justify-between text-sm text-muted">
                          <span>MAPE: 2.3%</span>
                          <span>RMSE: $1,240</span>
                          <span>Accuracy: 97.7%</span>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </TabsContent>

                {/* Merchants Tab */}
                <TabsContent value="merchants">
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between">
                      <div>
                        <CardTitle>Top Merchants</CardTitle>
                        <CardDescription>Where you spend the most money</CardDescription>
                      </div>
                      <div className="flex gap-2">
                        <Select value="all" className="w-40">
                          <SelectTrigger className="w-full"><SelectValue placeholder="All Categories" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All</SelectItem>
                            <SelectItem value="food">Food & Dining</SelectItem>
                            <SelectItem value="transport">Transportation</SelectItem>
                            <SelectItem value="shopping">Shopping</SelectItem>
                          </SelectContent>
                        </Select>
                        <Select value="30d" className="w-36">
                          <SelectTrigger className="w-full"><SelectValue placeholder="Period" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="7d">7 Days</SelectItem>
                            <SelectItem value="30d">30 Days</SelectItem>
                            <SelectItem value="90d">90 Days</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Rank</TableHead>
                              <TableHead>Merchant</TableHead>
                              <TableHead>Category</TableHead>
                              <TableHead>Transactions</TableHead>
                              <TableHead className="text-right">Total Spent</TableHead>
                              <TableHead className="text-right">Avg/Transaction</TableHead>
                              <TableHead>Trend</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {analyticsData.topMerchants.map((merchant, i) => (
                              <TableRow key={merchant.merchant}>
                                <TableCell className="font-medium text-text">{i + 1}</TableCell>
                                <TableCell className="font-medium text-text">{merchant.merchant}</TableCell>
                                <TableCell><Badge variant="default">{merchant.category}</Badge></TableCell>
                                <TableCell className="text-center">{merchant.count}</TableCell>
                                <TableCell className="text-right font-medium text-red-600">-{formatCurrency(merchant.amount)}</TableCell>
                                <TableCell className="text-right text-muted">{formatCurrency(merchant.amount / merchant.count)}</TableCell>
                                <TableCell>
                                  {merchant.amount > 1000 ? (
                                    <TrendingUp className="w-4 h-4 text-red-500" />
                                  ) : (
                                    <TrendingDown className="w-4 h-4 text-green-500" />
                                  )}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            </div>
          </div>
        );
      </div>
    );
  );
}

// Helper function to generate mock analytics data
function generateMockAnalyticsData(filters: any, accounts: Account[], transactions: Transaction[]): AnalyticsData {
  const now = new Date();
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  
  return {
    summary: {
      totalIncome: 85000,
      totalExpense: 52000,
      netFlow: 33000,
      savingsRate: 38.8,
      transactionCount: 245,
      avgTransaction: 212.5,
      largestExpense: 2500,
      largestIncome: 5000,
    },
    trends: months.slice(-6).map((month, i) => ({
      period: month,
      income: 7000 + Math.random() * 2000,
      expense: 4000 + Math.random() * 3000,
      net: 3000 + Math.random() * 1000,
      savingsRate: 35 + Math.random() * 10,
    })),
    categoryBreakdown: [
      { category: 'Food & Dining', amount: 12000, percentage: 23.1, count: 45, trend: 'up' },
      { category: 'Transportation', amount: 8500, percentage: 16.3, count: 28, trend: 'stable' },
      { category: 'Shopping', amount: 7200, percentage: 13.8, count: 32, trend: 'down' },
      { category: 'Housing', amount: 6800, percentage: 13.1, count: 12, trend: 'stable' },
      { category: 'Entertainment', amount: 5200, percentage: 10.0, count: 18, trend: 'up' },
      { category: 'Utilities', amount: 4500, percentage: 8.7, count: 8, trend: 'stable' },
      { category: 'Healthcare', amount: 3200, percentage: 6.2, count: 6, trend: 'up' },
      { category: 'Other', amount: 4600, percentage: 8.8, count: 15, trend: 'down' },
    ],
    accountPerformance: accounts.map((acc, i) => ({
      accountId: acc.id,
      accountNumber: acc.accountNumber,
      accountType: acc.accountType,
      balance: acc.balance,
      income: 5000 + Math.random() * 3000,
      expense: 2000 + Math.random() * 2000,
      netFlow: 3000 + Math.random() * 1000,
      transactionCount: Math.floor(20 + Math.random() * 30),
    })),
    monthlyComparison: months.map((month, i) => ({
      month,
      thisYear: 4000 + Math.random() * 2000,
      lastYear: 3500 + Math.random() * 1500,
      change: (Math.random() - 0.3) * 20,
    })),
    cashFlowForecast: Array.from({ length: 90 }, (_, i) => {
      const date = new Date();
      date.setDate(date.getDate() + i);
      return {
        date: format(date, 'MMM d'),
        projectedBalance: 50000 + (Math.random() - 0.3) * 2000 * Math.sqrt(i + 1),
        confidence: Math.max(50, 95 - i * 0.5),
      };
    }),
    topMerchants: [
      { merchant: 'Amazon', amount: 2800, count: 24, category: 'Shopping' },
      { merchant: 'Uber', amount: 1800, count: 45, category: 'Transportation' },
      { merchant: 'Whole Foods', amount: 2200, count: 18, category: 'Food & Dining' },
      { merchant: 'Netflix', amount: 180, count: 6, category: 'Entertainment' },
      { merchant: 'Shell', amount: 1200, count: 22, category: 'Transportation' },
      { merchant: 'Starbucks', amount: 650, count: 35, category: 'Food & Dining' },
      { merchant: 'Target', amount: 1100, count: 12, category: 'Shopping' },
      { merchant: 'Spotify', amount: 120, count: 3, category: 'Entertainment' },
    ],
    recurringExpenses: [
      { merchant: 'Netflix', amount: 17.99, frequency: 'Monthly', nextDate: '2024-02-15', category: 'Entertainment' },
      { merchant: 'Spotify', amount: 9.99, frequency: 'Monthly', nextDate: '2024-02-10', category: 'Entertainment' },
      { merchant: 'Gym Membership', amount: 49.99, frequency: 'Monthly', nextDate: '2024-02-01', category: 'Health' },
      { merchant: 'Phone Bill', amount: 85.00, frequency: 'Monthly', nextDate: '2024-02-05', category: 'Utilities' },
      { merchant: 'Rent', amount: 1800, frequency: 'Monthly', nextDate: '2024-02-01', category: 'Housing' },
      { merchant: 'Car Insurance', amount: 145.00, frequency: 'Monthly', nextDate: '2024-02-15', category: 'Transportation' },
    ],
    monthlyComparison: [
      { month: 'Jan', thisYear: 4200, lastYear: 3800, change: 10.5 },
      { month: 'Feb', thisYear: 4100, lastYear: 3900, change: 5.1 },
      { month: 'Mar', thisYear: 4300, lastYear: 4000, change: 7.5 },
      { month: 'Apr', thisYear: 4400, lastYear: 3850, change: 14.3 },
      { month: 'May', thisYear: 4500, lastYear: 4100, change: 9.8 },
      { month: 'Jun', thisYear: 4600, lastYear: 4200, change: 9.5 },
    ],
  };
}

import { Building2, Minus, CreditCard, DollarSign, ArrowDownLeft, ArrowUpRight, ArrowRightLeft, TrendingUp, TrendingDown, Target, Activity, Zap, BarChart3, PieChart, Target as TargetIcon, Filter, Download, Calendar, Clock, AlertTriangle, CheckCircle, XCircle, Info, ChevronLeft, ChevronRight, Maximize2, Minimize2, Settings, Search, X, Shield, Lock, Key, Eye, EyeOff, Moon, Sun, Monitor, Smartphone, Globe, AlertCircle, CheckCircle, XCircle, Shield as ShieldIcon, Lock as LockIcon, Fingerprint, QrCode, BarChart2, FileText, Shield as ShieldIcon2, Globe, HelpCircle, ChevronRight, Moon as MoonIcon, Sun as SunIcon, Zap as ZapIcon2, Settings as SettingsIcon, Users, Building2 as Building2Icon, Globe as GlobeIcon, Volume2, VolumeX, Fingerprint, QrCode as QrCodeIcon, BarChart2 as BarChart2Icon, FileText as FileTextIcon, Shield as ShieldIcon3, Lock as LockIcon2, Eye, EyeOff, Moon as MoonIcon2, Sun as SunIcon2, Zap as ZapIcon3, Settings as SettingsIcon2, Users as UsersIcon, Building2 as Building2Icon2, Globe as GlobeIcon2 } from 'lucide-react';