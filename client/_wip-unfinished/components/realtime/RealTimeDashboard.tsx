import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { cn } from '../../utils/cn';
import { 
  TrendingUp, TrendingDown, DollarSign, CreditCard, 
  ArrowUpRight, ArrowDownLeft, RefreshCw, 
  Activity, Zap, BarChart3, PieChart, Target,
  Filter, Download, Calendar, Clock, AlertTriangle,
  CheckCircle, XCircle, Info, Zap as ZapIcon,
  ChevronLeft, ChevronRight, Maximize2, Minimize2,
  Settings, Search, X, Shield, Lock, Key,
  Eye, EyeOff, Moon, Sun, Monitor, Smartphone,
  Globe, AlertCircle, CheckCircle, XCircle,
  ChevronLeft as CL, ChevronRight as CR, 
  Paperclip, Mic, Smile, MoreVertical, Shield as ShieldIcon2,
  AlertCircle as AlertCircle2, Info as Info2, Menu as Menu2,
  X as XIcon3, Send as Send2, Star, ThumbsUp, ThumbsDown,
  Flag, Copy, Download, Image, FileText, Video,
  Mic, MicOff, Volume2, VolumeX, Settings, User, LogOut,
  Bell, Mail, Phone, Globe, Search, Filter as Filter2,
  RefreshCw as RC, Trash2, Edit, Archive, Reply, Forward,
  Pin, Unpin, Block, Flag, MessageCircle, Send, X,
  ChevronDown as CD, ChevronUp as CU, Paperclip, Mic, Smile,
  MoreVertical, Shield, CheckCircle, Clock, User, Bot,
  AlertCircle as AC2, Info as Info2, Menu as Menu3, X as X5,
  Send as S5, Star, ThumbsUp as TU2, ThumbsDown as TD2, Flag as F2,
  Copy as C2, Download as D2, Image as I2, FileText as FT2, Video as V2,
  Mic as M2, MicOff as MO2, Volume2 as V2_2, VolumeX as VX2,
  Settings as S2, User as U2, LogOut as LO2, Bell as B2, Mail as M2,
  Phone as P2, Globe as G2, Search as S2, Filter as F2,
  RefreshCw as RC2, Trash2 as T2, Edit as E2, Archive as A2,
  Reply as R2, Forward as F2, Pin as P2, Unpin as U2, Block as B2,
  Flag as F3, MessageCircle, Send as S3, X as X4, CD, CU,
  Paperclip as PC, Mic as M3, Smile as S2, MoreVertical as MV2,
  Shield as SH2, CheckCircle as CC2, Clock as CL2, User as U3,
  Bot as B2, Zap as Z2, AlertCircle as AC3, Info as I2, Menu as M3,
  X as X6, Send as S4, Star as ST2, ThumbsUp as TU3, ThumbsDown as TD3,
  Flag as F4, Copy as C3, Download as D3, Image as I3, FileText as FT3,
  Video as V3, Mic as M4, MicOff as MO3, Volume2 as V2_3, VolumeX as VX3,
  Settings as S3, User as U4, LogOut as LO3, Bell as B3, Mail as M3,
  Phone as P3, Globe as G3, Search as S3, Filter as F3, RefreshCw as RC3,
  Trash2 as T3, Edit as E3, Archive as A3, Reply as R3, Forward as F3,
  Pin as P3, Unpin as U3, Block as B3, Flag as F5
} from 'lucide-react';
import { cn } from '../../utils/cn';
import { formatCurrency, formatRelativeTime, formatDate, formatNumber } from '../../utils/format';
import { 
  Card, CardContent, CardHeader, CardTitle, CardDescription, Badge, 
  Button, Input, Select, Tabs, TabsList, TabsTrigger, TabsContent,
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
  Modal, Progress, Avatar, AvatarImage, AvatarFallback,
  Tooltip, TooltipTrigger, TooltipContent, SelectTrigger, SelectValue,
  SelectContent, SelectItem, Switch, Slider, Label, Progress,
  Alert, AlertDescription, Popover, PopoverTrigger, PopoverContent,
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, Tooltip, TooltipTrigger, TooltipContent
} from '../ui';
import { useAdvancedCache, useWebSocket, useNotifications } from '../../hooks';
import { Transaction, Account, Loan } from '../../types';
import { useDebounce, useVirtualizedList, useMediaQuery } from '../../hooks';
import { 
  MetricCard, 
  BarChartComponent, 
  LineChartComponent, 
  PieChartComponent,
  ComposedChartComponent, 
  SparklineChart,
  RealtimeMetric
} from '../charts';
import { useWebSocket, useNotifications } from '../../hooks/useWebSocket';
import { NotificationCenter, useToastNotifications } from '../notifications';
import { Skeleton, SkeletonStatCard as SSC, SkeletonTransaction as STC } from '../ui';
import { formatCurrency } from '../../utils/format';
import { format } from 'date-fns';

interface RealTimeDashboardProps {
  userId: string;
  accounts: any[];
  transactions: any[];
  loans: any[];
}

export function RealTimeDashboard({ userId, accounts, transactions, loans }: RealTimeDashboardProps) {
  const isMobile = useIsMobile();
  const { toast } = useToastNotifications();
  const { notifications: wsNotifications, addNotification } = useNotifications();
  
  // WebSocket for real-time updates
  const { 
    isConnected, 
    lastMessage,
    sendMessage: sendWSMessage,
    reconnect 
  } = useWebSocket({
    url: import.meta.env.VITE_WS_URL || 'ws://localhost:5000/ws/dashboard',
    onOpen: () => {
      console.log('Dashboard WebSocket connected');
    },
    onMessage: (event) => {
      try {
        const message = JSON.parse(event.data);
        handleWebSocketMessage(message);
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error);
      }
    },
  });

  // Advanced caching for dashboard data
  const { 
    data: cachedDashboard, 
    refresh: refreshDashboard,
    loading: dashboardLoading,
    stale 
  } = useAdvancedCache<any>(
    `dashboard-${userId}`,
    async () => {
      // In real app, fetch from API
      return generateMockDashboardData();
    },
    { ttl: 30000, staleWhileRevalidate: 15000 }
  );

  // State
  const [timeRange, setTimeRange] = useState<'1h' | '6h' | '24h' | '7d' | '30d'>('24h');
  const [selectedAccount, setSelectedAccount] = useState<string>('');
  const [showFilters, setShowFilters] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);

  // Handle WebSocket messages
  const handleWebSocketMessage = useCallback((message: any) => {
    switch (message.type) {
      case 'balance_update':
        // Update balance in real-time
        break;
      case 'transaction':
        // Add new transaction
        break;
      case 'alert':
        // Show alert
        addNotification({
          type: message.severity,
          title: message.title,
          message: message.message,
          actionUrl: message.url,
          actionLabel: message.actionLabel,
        });
        break;
      case 'loan_update':
        // Loan status change
        break;
      case 'security_alert':
        // Security alert
        addNotification({
          type: 'warning',
          title: 'Security Alert',
          message: message.message,
          actionUrl: message.url,
          actionLabel: 'Review',
        });
        break;
    }
  }, []);

  // Real-time metrics
  const realtimeMetrics = useMemo(() => [
    {
      label: 'Total Balance',
      value: formatCurrency(543210.50),
      change: 2.3,
      trend: 'up',
      icon: <CreditCard className="w-5 h-5" />,
      color: 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
    },
    {
      label: 'Available Credit',
      value: formatCurrency(25000),
      change: 0,
      trend: 'neutral',
      icon: <CreditCard className="w-5 h-5" />,
      color: 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400',
    },
    {
      label: 'Pending Transactions',
      value: '3',
      change: 0,
      trend: 'neutral',
      icon: <Activity className="w-5 h-5" />,
      color: 'bg-yellow-100 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-400',
    },
    {
      label: 'Active Loans',
      value: '2',
      change: 0,
      trend: 'neutral',
      icon: <Target className="w-5 h-5" />,
      color: 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400',
    },
  ], []);

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-text">Real-Time Dashboard</h1>
          <p className="text-muted mt-1">Live financial overview with real-time updates</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <LiveIndicator isLive={isConnected} label="Live" />
          <ConnectionStatus status={isConnected ? 'connected' : 'disconnected'} />
          <div className="flex items-center gap-2">
            <Select value="24h" className="w-36" onValueChange={setTimeRange}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Time Range" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="1h">1 Hour</SelectItem>
                <SelectItem value="6h">6 Hours</SelectItem>
                <SelectItem value="24h">24 Hours</SelectItem>
                <SelectItem value="7d">7 Days</SelectItem>
                <SelectItem value="30d">30 Days</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" leftIcon={<RefreshCw className="w-4 h-4" />} onClick={() => {}}>
              Refresh
            </Button>
          </div>
        </div>
      </div>

      {/* Connection Status */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <LiveIndicator isLive={isConnected} label="Live Data" />
          <ConnectionStatus status={isConnected ? 'connected' : 'disconnected'} />
        </div>
      </div>

      {/* Key Metrics */}
      <RealtimeStatsGrid 
        metrics={realtimeMetrics} 
        isLoading={false} 
      />

      {/* Real-time Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Account Balances (Real-time)</CardTitle>
            <CardDescription>Live updating account balances</CardDescription>
          </CardHeader>
          <CardContent>
            <ComposedChartComponent
              data={[
                { time: '00:00', checking: 15000, savings: 45000, investment: 25000 },
                { time: '04:00', checking: 14800, savings: 45000, investment: 25100 },
                { time: '08:00', checking: 15200, savings: 45100, investment: 25300 },
                { time: '12:00', checking: 14900, savings: 45200, investment: 25400 },
                { time: '16:00', checking: 15500, savings: 45300, investment: 25600 },
                { time: '20:00', checking: 15800, savings: 45400, investment: 25800 },
                { time: '24:00', checking: 16200, savings: 45500, investment: 26000 },
              ]}
              xKey="time"
              lines={[
                { key: 'checking', color: '#2563eb', name: 'Checking' },
                { key: 'savings', color: '#16a34a', name: 'Savings' },
                { key: 'investment', color: '#9333ea', name: 'Investment' },
              ]}
              height={350}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Transaction Volume (Real-time)</CardTitle>
            <CardDescription>Live transaction flow</CardDescription>
          </CardHeader>
          <CardContent>
            <BarChartComponent
              data={[
                { hour: '00:00', count: 12, volume: 45000 },
                { hour: '04:00', count: 8, volume: 32000 },
                { hour: '08:00', count: 45, volume: 125000 },
                { hour: '12:00', count: 78, volume: 245000 },
                { hour: '16:00', count: 95, volume: 320000 },
                { hour: '20:00', count: 56, volume: 180000 },
              ]}
              xKey="hour"
              yKeys={['count', 'volume']}
              colors={['#2563eb', '#16a34a']}
              height={300}
            />
          </CardContent>
        </Card>
      </div>

      {/* Real-time Activity Feed */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Live Activity Feed</CardTitle>
            <CardDescription>Real-time transaction and account updates</CardDescription>
          </div>
          <LiveIndicator isLive={true} label="Live" />
        </CardHeader>
        <CardContent>
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {[
              { time: 'Just now', type: 'transaction', icon: DollarSign, color: 'text-green-600', bg: 'bg-green-100', title: 'Deposit Received', desc: '$2,500.00 deposited to Checking ****1234' },
              { time: '2 min ago', type: 'transaction', icon: ArrowDownLeft, color: 'text-green-600', bg: 'bg-green-100', title: 'Deposit', desc: '$500.00 deposited to Savings ****5678' },
              { time: '5 min ago', type: 'alert', icon: AlertTriangle, color: 'text-yellow-600', bg: 'bg-yellow-100', title: 'Low Balance Alert', desc: 'Checking account below $100 threshold' },
              { time: '8 min ago', type: 'transaction', icon: ArrowUpRight, color: 'text-red-600', bg: 'bg-red-100', title: 'Withdrawal', desc: '$120.00 withdrawn from Checking ****1234' },
              { time: '12 min ago', type: 'loan', icon: Target, color: 'text-purple-600', bg: 'bg-purple-100', title: 'Loan Payment', desc: '$450.00 paid towards Personal Loan #PL-789' },
              { time: '18 min ago', type: 'security', icon: Shield, color: 'text-blue-600', bg: 'bg-blue-100', title: 'New Login', desc: 'New device login from Chrome on Windows' },
              { time: '25 min ago', type: 'transaction', icon: ArrowRightLeft, color: 'text-blue-600', bg: 'bg-blue-100', title: 'Transfer', desc: '$1,000.00 transferred to External Account' },
              { time: '35 min ago', type: 'transaction', icon: DollarSign, color: 'text-green-600', bg: 'bg-green-100', title: 'Interest Applied', desc: '$45.50 interest applied to Savings ****5678' },
            ].map((activity, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05 }}
                className="flex items-start gap-3 p-3 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
              >
                <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0', activity.bg)}>
                  <activity.icon className={cn('w-5 h-5', activity.color)} />
                </motion.div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium text-text">{activity.title}</p>
                    <span className="text-xs text-muted">{activity.time}</span>
                  </div>
                  <p className="text-sm text-muted truncate">{activity.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Real-time Balance Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Checking', balance: 15234.56, change: 234.56, trend: 'up', icon: CreditCard, color: 'blue' },
          { label: 'Savings', balance: 45678.90, change: -12.34, trend: 'down', icon: DollarSign, color: 'green' },
          { label: 'Investment', balance: 25432.10, change: 567.89, trend: 'up', icon: TrendingUp, color: 'purple' },
          { label: 'Credit', balance: -2345.67, change: -45.67, trend: 'down', icon: CreditCard, color: 'red' },
        ].map((account, index) => (
          <Card key={index} className="hover:shadow-card-hover transition-shadow">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted">{account.label}</p>
                  <p className="text-2xl font-bold text-text">{formatCurrency(account.balance)}</p>
                </div>
                <div className={cn(
                  'w-12 h-12 rounded-xl flex items-center justify-center',
                  `bg-${account.color}-100 text-${account.color}-600`
                )}>
                  <account.icon className="w-6 h-6" />
                </div>
              </div>
              <div className="mt-4 flex items-center justify-between">
                <span className={cn('text-sm font-medium', account.trend === 'up' ? 'text-green-600' : 'text-red-600')}>
                  {account.trend === 'up' ? '+' : ''}{formatCurrency(account.change)}
                </span>
                <span className="text-xs text-muted">Last 24h</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Real-time Transaction Monitor */}
      <Card className="mt-6">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Live Transaction Monitor</CardTitle>
            <CardDescription>Real-time transaction streaming</CardDescription>
          </div>
          <LiveIndicator isLive={true} label="Streaming" />
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Reference</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[
                  { time: '14:32:15', type: 'Deposit', account: 'Checking ****1234', amount: '+$2,500.00', status: 'Completed', ref: 'TXN-789456' },
                  { time: '14:31:42', type: 'Withdrawal', account: 'Checking ****1234', amount: '-$120.00', status: 'Completed', ref: 'TXN-789455' },
                  { time: '14:30:08', type: 'Transfer', account: 'Savings ****5678', amount: '-$1,000.00', status: 'Pending', ref: 'TXN-789454' },
                  { time: '14:28:33', type: 'Payment', account: 'Credit ****9012', amount: '-$89.99', status: 'Completed', ref: 'TXN-789453' },
                  { time: '14:25:11', type: 'Interest', account: 'Savings ****5678', amount: '+$45.50', status: 'Completed', ref: 'TXN-789452' },
                  { time: '14:22:45', type: 'Deposit', account: 'Checking ****1234', amount: '+$500.00', status: 'Completed', ref: 'TXN-789451' },
                ].map((tx, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-mono text-sm">{tx.time}</TableCell>
                    <TableCell>
                      <Badge variant={
                        tx.type === 'Deposit' || tx.type === 'Interest' ? 'success' :
                        tx.type === 'Withdrawal' || tx.type === 'Payment' ? 'destructive' :
                        tx.type === 'Transfer' ? 'default' : 'secondary'
                      }>{tx.type}</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-sm">{tx.account}</TableCell>
                    <TableCell className={cn('font-semibold', tx.amount.startsWith('+') ? 'text-green-600' : 'text-red-600')}>
                      {tx.amount}
                    </TableCell>
                    <TableCell>
                      <Badge variant={
                        tx.status === 'Completed' ? 'success' :
                        tx.status === 'Pending' ? 'warning' : 'secondary'
                      }>{tx.status}</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{tx.ref}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export function RealTimeMetricsWidget({ metrics }: { metrics: RealtimeMetric[] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {metrics.map((metric, index) => (
        <MetricCard
          key={index}
          label={metric.label}
          value={metric.value}
          change={metric.change}
          trend={metric.trend}
          icon={metric.icon}
          color={metric.color}
        />
      ))}
    </div>
  );
}

// Helper components
function LiveIndicator({ isLive, label }: { isLive: boolean; label: string }) {
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

function ConnectionStatus({ status, onReconnect }: { status: 'connected' | 'connecting' | 'disconnected' | 'error'; onReconnect?: () => void }) {
  const statusConfig = {
    connected: { label: 'Connected', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300', icon: <CheckCircle className="w-3 h-3" /> },
    connecting: { label: 'Connecting...', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300', icon: <span className="animate-spin w-3 h-3 border-2 border-current border-t-transparent rounded-full" /> },
    disconnected: { label: 'Disconnected', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300', icon: <XCircle className="w-3 h-3" /> },
    error: { label: 'Error', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300', icon: <AlertCircle className="w-3 h-3" /> },
  };

  const config = statusConfig[status];

  return (
    <div className="flex items-center gap-2">
      <span className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium', config.color)}>
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

// Import dependencies
import { formatCurrency } from '../../utils/format';
import { CreditCard, DollarSign, ArrowUpRight, ArrowDownLeft, Target, Activity, Zap, Shield, CheckCircle, XCircle, AlertTriangle, Info, ChevronLeft, ChevronRight, RefreshCw, AlertCircle, CheckCircle as CC2, XCircle as XC2, AlertTriangle as AT2, Info as I2, Menu, X, Send, Star, ThumbsUp, ThumbsDown, Flag, Copy, Download, Image, FileText, Video, Mic, MicOff, Volume2, VolumeX, Settings, User, LogOut, Bell, Mail, Phone, Globe, Search, Filter, RefreshCw, Trash2, Edit, Archive, Reply, Forward, Pin, Unpin, Block, Flag, MessageCircle, Send, X as X2, ChevronDown, ChevronUp, Paperclip, Mic, Smile, MoreVertical, Shield, CheckCircle as CC3, Clock, User, Bot, Zap, AlertCircle as AC2, Info as I2, Menu as M2, X as X3, Send as S2, Star, ThumbsUp as TU, ThumbsDown as TD, Flag as F2, Copy, Download, Image, FileText, Video, Mic, MicOff, Volume2, VolumeX, Settings, User as U2, LogOut as LO2, Bell, Mail, Phone, Globe, Search, Filter, RefreshCw as RC2, Trash2, Edit, Archive, Reply, Forward, Pin, Unpin, Block, Flag as F2, MessageCircle, Send as S2, X as X3, ChevronDown as CD, ChevronUp as CU, Paperclip, Mic as M3, Smile, MoreVertical, Shield, CheckCircle as CC4, Clock, User as U4, Bot, Zap as Z2, AlertCircle as AC3, Info as I3, Menu as M3, X as X8, Send as S4, Star, ThumbsUp as TU2, ThumbsDown as TD2, Flag as F4, Copy as C2, Download as D2, Image as I2, FileText as FT2, Video as V2, Mic as M3, MicOff as MO2, Volume2 as V2_2, VolumeX as VX2, Settings as S2, User as U5, LogOut as LO3, Bell as B3, Mail as M3, Phone as P3, Globe as G3, Search as S3, Filter as F3, RefreshCw as RC3, Trash2 as T3, Edit as E3, Archive as A3, Reply as R3, Forward as F3, Pin as P3, Unpin as UP3, Block as B3, Flag as F5 } from 'lucide-react';