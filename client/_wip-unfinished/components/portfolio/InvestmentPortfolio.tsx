import { useState, useEffect, useMemo, useCallback } from 'react';
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
  TrendingDown as TrendingDownIcon,
  Plus, Minus, PieChart as PieChartIcon,
  BarChart2, LineChart, Activity as ActivityIcon,
  Target as TargetIcon2, Zap as ZapIcon2
} from 'lucide-react';
import { formatCurrency, formatRelativeTime, formatDate, formatNumber } from '../../utils/format';
import { 
  Card, CardContent, CardHeader, CardTitle, CardDescription, Badge, 
  Button, Input, Select, Tabs, TabsList, TabsTrigger, TabsContent,
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
  Modal, Progress, Avatar, AvatarImage, AvatarFallback,
  Tooltip, TooltipTrigger, TooltipContent, SelectTrigger, SelectValue,
  SelectContent, SelectItem, Skeleton, Switch, Slider,
  Popover, PopoverTrigger, PopoverContent, PopoverArrow,
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, Label, Textarea
} from '../ui';
import { useAdvancedCache, useWebSocket, useNotifications } from '../../hooks';
import { Transaction, Account } from '../../types';
import { useDebounce, useVirtualizedList, useMediaQuery } from '../../hooks';
import { 
  BarChartComponent, 
  LineChartComponent, 
  PieChartComponent, 
  ComposedChartComponent, 
  MetricCard,
  SparklineChart,
  RealtimeMetric
} from '../charts';
import { useWebSocket, useNotifications } from '../../hooks/useWebSocket';
import { NotificationCenter, useToastNotifications } from '../notifications';
import { formatCurrency } from '../../utils/format';
import { cn } from '../../utils/cn';

interface Holding {
  id: string;
  symbol: string;
  name: string;
  quantity: number;
  avgCost: number;
  currentPrice: number;
  value: number;
  gainLoss: number;
  gainLossPercent: number;
  sector: string;
  allocation: number;
  change1d: number;
  change7d: number;
  change30d: number;
}

interface PortfolioSummary {
  totalValue: number;
  totalCost: number;
  totalGainLoss: number;
  totalGainLossPercent: number;
  dayChange: number;
  dayChangePercent: number;
  cashBalance: number;
  buyingPower: number;
}

interface AllocationData {
  sector: string;
  value: number;
  percentage: number;
  color: string;
}

interface PerformanceData {
  date: string;
  portfolioValue: number;
  benchmarkValue: number;
  portfolioReturn: number;
  benchmarkReturn: number;
}

export function InvestmentPortfolio({ 
  initialHoldings = [],
  onTrade,
  onDeposit,
  onWithdraw
}: { 
  initialHoldings?: Holding[];
  onTrade?: (trade: TradeOrder) => void;
  onDeposit?: (amount: number) => void;
  onWithdraw?: (amount: number) => void;
}) {
  const [activeTab, setActiveTab] = useState<'overview' | 'holdings' | 'performance' | 'orders' | 'settings'>('overview');
  const [selectedHolding, setSelectedHolding] = useState<Holding | null>(null);
  const [showTradeModal, setShowTradeModal] = useState(false);
  const [tradeType, setTradeType] = useState<'buy' | 'sell'>('buy');
  const [tradeForm, setTradeForm] = useState({
    symbol: '',
    quantity: 0,
    price: 0,
    orderType: 'market' as 'market' | 'limit' | 'stop',
    timeInForce: 'day' as 'day' | 'gtc' | 'ioc',
  });
  const [timeRange, setTimeRange] = useState<'1d' | '1w' | '1m' | '3m' | '1y' | 'all'>('1m');
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [depositAmount, setDepositAmount] = useState(0);
  const [withdrawAmount, setWithdrawAmount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [sortBy, setSortBy] = useState<'value' | 'gainLoss' | 'gainLossPercent' | 'allocation'>('value');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [filters, setFilters] = useState({
    sector: '',
    minAllocation: 0,
    maxAllocation: 100,
    minGainLoss: -100,
    maxGainLoss: 100,
  });

  const { toast } = useToastNotifications();
  const { notifications: wsNotifications, addNotification } = useNotifications();
  const isMobile = useIsMobile();

  // Mock holdings data
  const [holdings, setHoldings] = useState<Holding[]>([
    { id: '1', symbol: 'AAPL', name: 'Apple Inc.', quantity: 50, avgCost: 150.00, currentPrice: 175.50, value: 8775, gainLoss: 1275, gainLossPercent: 17.0, sector: 'Technology', allocation: 15.2, change1d: 1.2, change7d: 5.3, change30d: 12.5 },
    { id: '2', symbol: 'MSFT', name: 'Microsoft Corp.', quantity: 30, avgCost: 280.00, currentPrice: 310.25, value: 9307.5, gainLoss: 907.5, gainLossPercent: 10.8, sector: 'Technology', allocation: 16.1, change1d: 0.8, change7d: 3.2, change30d: 8.7 },
    { id: '3', symbol: 'GOOGL', name: 'Alphabet Inc.', quantity: 20, avgCost: 120.00, currentPrice: 135.80, value: 2716, gainLoss: 316, gainLossPercent: 13.2, sector: 'Technology', allocation: 4.7, change1d: -0.5, change7d: 2.1, change30d: 9.8 },
    { id: '4', symbol: 'TSLA', name: 'Tesla Inc.', quantity: 15, avgCost: 200.00, currentPrice: 245.30, value: 3679.5, gainLoss: 679.5, gainLossPercent: 22.6, sector: 'Consumer Cyclical', allocation: 6.4, change1d: 2.1, change7d: -3.2, change30d: 15.3 },
    { id: '5', symbol: 'NVDA', name: 'NVIDIA Corp.', quantity: 10, avgCost: 400.00, currentPrice: 485.50, value: 4855, gainLoss: 855, gainLossPercent: 21.4, sector: 'Technology', allocation: 8.4, change1d: 3.5, change7d: 8.7, change30d: 25.6 },
    { id: '6', symbol: 'JPM', name: 'JPMorgan Chase', quantity: 25, avgCost: 140.00, currentPrice: 155.80, value: 3895, gainLoss: 395, gainLossPercent: 11.3, sector: 'Financial Services', allocation: 6.7, change1d: 0.3, change7d: 1.2, change30d: 4.5 },
    { id: '7', symbol: 'JNJ', name: 'Johnson & Johnson', quantity: 20, avgCost: 160.00, currentPrice: 158.50, value: 3170, gainLoss: -30, gainLossPercent: -0.9, sector: 'Healthcare', allocation: 5.5, change1d: -0.2, change7d: 0.5, change30d: 2.1 },
    { id: '8', symbol: 'V', name: 'Visa Inc.', quantity: 15, avgCost: 200.00, currentPrice: 215.70, value: 3235.5, gainLoss: 235.5, gainLossPercent: 7.8, sector: 'Financial Services', allocation: 5.6, change1d: 0.5, change7d: 2.3, change30d: 6.8 },
    { id: '9', symbol: 'PG', name: 'Procter & Gamble', quantity: 20, avgCost: 145.00, currentPrice: 148.20, value: 2964, gainLoss: 64, gainLossPercent: 2.2, sector: 'Consumer Defensive', allocation: 5.1, change1d: 0.1, change7d: 0.8, change30d: 1.5 },
    { id: '10', symbol: 'HD', name: 'Home Depot', quantity: 12, avgCost: 300.00, currentPrice: 315.40, value: 3784.8, gainLoss: 184.8, gainLossPercent: 5.1, sector: 'Consumer Cyclical', allocation: 6.5, change1d: -0.3, change7d: 1.5, change30d: 4.2 },
  ]);

  // Portfolio summary
  const portfolioSummary = useMemo((): PortfolioSummary => {
    const totalValue = holdings.reduce((sum, h) => sum + h.value, 0);
    const totalCost = holdings.reduce((sum, h) => sum + h.quantity * h.avgCost, 0);
    const totalGainLoss = holdings.reduce((sum, h) => sum + h.gainLoss, 0);
    const totalGainLossPercent = totalCost > 0 ? (totalGainLoss / totalCost) * 100 : 0;
    const dayChange = holdings.reduce((sum, h) => sum + h.value * h.change1d / 100, 0);
    const dayChangePercent = totalValue > 0 ? (dayChange / totalValue) * 100 : 0;
    
    return {
      totalValue,
      totalCost,
      totalGainLoss,
      totalGainLossPercent,
      dayChange,
      dayChangePercent,
      cashBalance: 15000,
      buyingPower: 25000,
    };
  }, [holdings]);

  // Sector allocation
  const sectorAllocation = useMemo((): AllocationData[] => {
    const sectors = new Map<string, { value: number; count: number }>();
    holdings.forEach(h => {
      const existing = sectors.get(h.sector) || { value: 0, count: 0 };
      sectors.set(h.sector, { value: existing.value + h.value, count: existing.count + 1 });
    });
    
    const totalValue = holdings.reduce((sum, h) => sum + h.value, 0);
    const colors = ['#2563eb', '#16a34a', '#ea580c', '#9333ea', '#ea580c', '#0891b2', '#65a30d', '#dc2626'];
    
    return Array.from(sectors.entries()).map(([sector, data], i) => ({
      sector,
      value: data.value,
      percentage: (data.value / totalValue) * 100,
      color: colors[i % colors.length],
    })).sort((a, b) => b.value - a.value);
  }, [holdings]);

  // Performance data
  const performanceData = useMemo((): PerformanceData[] => {
    const days = timeRange === '1d' ? 1 : timeRange === '1w' ? 7 : timeRange === '1m' ? 30 : timeRange === '3m' ? 90 : timeRange === '1y' ? 365 : 365 * 2;
    const data: PerformanceData[] = [];
    let portfolioValue = portfolioSummary.totalValue;
    let benchmarkValue = 50000;
    
    for (let i = days; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const portfolioReturn = (Math.random() - 0.48) * 0.02;
      const benchmarkReturn = (Math.random() - 0.5) * 0.015;
      portfolioValue = portfolioValue * (1 + portfolioReturn);
      benchmarkValue = benchmarkValue * (1 + benchmarkReturn);
      
      data.push({
        date: format(date, 'MMM d'),
        portfolioValue,
        benchmarkValue,
        portfolioReturn: (portfolioValue / portfolioSummary.totalValue - 1) * 100,
        benchmarkReturn: (benchmarkValue / 50000 - 1) * 100,
      });
    }
    return data;
  }, [timeRange, portfolioSummary]);

  // Filtered and sorted holdings
  const filteredHoldings = useMemo(() => {
    return holdings
      .filter(h => {
        if (filters.sector && h.sector !== filters.sector) return false;
        if (h.allocation < filters.minAllocation || h.allocation > filters.maxAllocation) return false;
        if (h.gainLossPercent < filters.minGainLoss || h.gainLossPercent > filters.maxGainLoss) return false;
        return true;
      })
      .sort((a, b) => {
        let aVal = a[sortBy];
        let bVal = b[sortBy];
        if (sortBy === 'gainLossPercent') {
          aVal = a.gainLossPercent;
          bVal = b.gainLossPercent;
        } else if (sortBy === 'allocation') {
          aVal = a.allocation;
          bVal = b.allocation;
        }
        if (aVal < bVal) return sortOrder === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortOrder === 'asc' ? 1 : -1;
        return 0;
      });
  }, [holdings, sortBy, sortOrder, filters]);

  const handleTrade = async () => {
    setIsLoading(true);
    try {
      // In real app, call trading API
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const trade: TradeOrder = {
        symbol: tradeForm.symbol,
        side: tradeType,
        quantity: tradeForm.quantity,
        price: tradeForm.price,
        orderType: tradeForm.orderType,
        timeInForce: tradeForm.timeInForce,
      };
      
      onTrade?.(trade);
      setShowTradeModal(false);
      setTradeForm({ symbol: '', quantity: 0, price: 0, orderType: 'market', timeInForce: 'day' });
      toast.success(`${tradeType.toUpperCase()} order placed successfully`);
    } catch (error) {
      toast.error('Failed to place trade');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeposit = async () => {
    if (depositAmount <= 0) return;
    setIsLoading(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 1000));
      onDeposit?.(depositAmount);
      setShowDepositModal(false);
      setDepositAmount(0);
      toast.success(`Deposited ${formatCurrency(depositAmount)}`);
    } catch (error) {
      toast.error('Deposit failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleWithdraw = async () => {
    if (withdrawAmount <= 0 || withdrawAmount > portfolioSummary.cashBalance) return;
    setIsLoading(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 1000));
      onWithdraw?.(withdrawAmount);
      setShowWithdrawModal(false);
      setWithdrawAmount(0);
      toast.success(`Withdrew ${formatCurrency(withdrawAmount)}`);
    } catch (error) {
      toast.error('Withdrawal failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSort = (field: string) => {
    if (sortBy === field) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
  };

  const getGainLossColor = (value: number) => {
    if (value > 0) return 'text-green-600 dark:text-green-400';
    if (value < 0) return 'text-red-600 dark:text-red-400';
    return 'text-muted';
  };

  const getChangeColor = (value: number) => {
    if (value > 0) return 'text-green-600 dark:text-green-400';
    if (value < 0) return 'text-red-600 dark:text-red-400';
    return 'text-muted';
  };

  const formatPercent = (value: number) => `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;

  const formatChange = (value: number) => `${value >= 0 ? '+' : ''}${value.toFixed(2)}`;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-text">Investment Portfolio</h1>
          <p className="text-muted mt-1">Manage your investments and track performance</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setShowDepositModal(true)} leftIcon={<Plus className="w-4 h-4" }>Deposit</Button>
          <Button onClick={() => setShowWithdrawModal(true)} leftIcon={<Minus className="w-4 h-4" }>Withdraw</Button>
          <Button onClick={() => { setTradeType('buy'); setShowTradeModal(true); }} leftIcon={<TrendingUp className="w-4 h-4" }>Buy</Button>
          <Button variant="outline" onClick={() => { setTradeType('sell'); setShowTradeModal(true); }} leftIcon={<TrendingDown className="w-4 h-4" }}>Sell</Button>
        </div>
      </div>

      {/* Portfolio Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <MetricCard
          label="Portfolio Value"
          value={formatCurrency(portfolioSummary.totalValue)}
          change={portfolioSummary.dayChangePercent}
          trend={portfolioSummary.dayChange >= 0 ? 'up' : 'down'}
          icon={<TrendingUp className="w-5 h-5" />}
          color="bg-primary-100 text-primary-600 dark:bg-primary-900/30 dark:text-primary-400"
          sparklineData={performanceData.map(p => p.portfolioValue)}
        />
        <MetricCard
          label="Total Gain/Loss"
          value={formatCurrency(portfolioSummary.totalGainLoss)}
          change={portfolioSummary.totalGainLossPercent}
          trend={portfolioSummary.totalGainLoss >= 0 ? 'up' : 'down'}
          icon={<TrendingUp className="w-5 h-5" />}
          color="bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400"
        />
        <MetricCard
          label="Day Change"
          value={formatCurrency(portfolioSummary.dayChange)}
          change={portfolioSummary.dayChangePercent}
          trend={portfolioSummary.dayChange >= 0 ? 'up' : 'down'}
          icon={<Activity className="w-5 h-5" />}
          color="bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400"
          sparklineData={performanceData.slice(-24).map(p => p.portfolioValue)}
        />
        <MetricCard
          label="Cash Balance"
          value={formatCurrency(portfolioSummary.cashBalance)}
          icon={<DollarSign className="w-5 h-5" />}
          color="bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400"
        />
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-2 md:grid-cols-5 gap-2">
          <TabsTrigger value="overview" className="flex items-center gap-2"><PieChartIcon className="w-4 h-4" /> Overview</TabsTrigger>
          <TabsTrigger value="holdings" className="flex items-center gap-2"><CreditCard className="w-4 h-4" /> Holdings</TabsTrigger>
          <TabsTrigger value="performance" className="flex items-center gap-2"><LineChart className="w-4 h-4" /> Performance</TabsTrigger>
          <TabsTrigger value="orders" className="flex items-center gap-2"><FileText className="w-4 h-4" /> Orders</TabsTrigger>
          <TabsTrigger value="settings" className="flex items-center gap-2"><Settings className="w-4 h-4" /> Settings</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Portfolio Allocation */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Portfolio Allocation</CardTitle>
                <CardDescription>Sector and asset allocation breakdown</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="lg:col-span-1">
                    <PieChartComponent
                      data={sectorAllocation.map(s => ({ name: s.sector, value: s.value }))}
                      title="Sector Allocation"
                      height={350}
                    />
                  </div>
                  <div className="space-y-4">
                    {sectorAllocation.map((sector, i) => (
                      <div key={sector.sector} className="flex items-center justify-between p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50">
                        <div className="flex items-center gap-3">
                          <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center', sector.color.replace('#', 'bg-') + '20')}>
                            <div className="w-4 h-4 rounded" style={{ backgroundColor: sector.color }} />
                          </div>
                          <div>
                            <p className="font-medium text-text">{sector.sector}</p>
                            <p className="text-sm text-muted">{formatCurrency(sector.value)}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold text-text">{formatCurrency(sector.value)}</p>
                          <p className="text-sm text-muted">{sector.percentage.toFixed(1)}%</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Account Summary */}
            <Card>
              <CardHeader>
                <CardTitle>Account Summary</CardTitle>
                <CardDescription>Cash and buying power</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200">
                    <p className="text-sm text-muted">Cash Balance</p>
                    <p className="text-2xl font-bold text-green-600 dark:text-green-400">{formatCurrency(portfolioSummary.cashBalance)}</p>
                  </div>
                  <div className="p-4 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200">
                    <p className="text-sm text-muted">Buying Power</p>
                    <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{formatCurrency(portfolioSummary.buyingPower)}</p>
                  </div>
                </div>
                <div className="p-4 rounded-xl bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200">
                  <p className="text-sm text-muted">Margin Available</p>
                  <p className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">{formatCurrency(portfolioSummary.buyingPower - portfolioSummary.cashBalance)}</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Performance Chart */}
          <Card className="lg:col-span-3">
            <CardHeader>
              <CardTitle>Portfolio Performance</CardTitle>
              <CardDescription>Portfolio vs Benchmark (S&P 500)</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4 mb-4">
                <Select value={timeRange} onValueChange={setTimeRange} className="w-40">
                  <SelectTrigger className="w-full"><SelectValue placeholder="Time Range" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1d">1 Day</SelectItem>
                    <SelectItem value="1w">1 Week</SelectItem>
                    <SelectItem value="1m">1 Month</SelectItem>
                    <SelectItem value="3m">3 Months</SelectItem>
                    <SelectItem value="1y">1 Year</SelectItem>
                    <SelectItem value="all">All Time</SelectItem>
                  </SelectContent>
                </Select>
                <div className="flex items-center gap-4 text-sm text-muted">
                  <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-primary-500" /> Portfolio</span>
                  <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-slate-400" /> S&P 500</span>
                </div>
              </div>
              <LineChartComponent
                data={performanceData}
                xKey="date"
                lines={[
                  { key: 'portfolioValue', color: '#2563eb', name: 'Portfolio' },
                  { key: 'benchmarkValue', color: '#94a3b8', name: 'S&P 500' },
                ]}
                height={350}
              />
              <div className="mt-4 grid grid-cols-4 gap-4 text-sm">
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50">
                  <p className="text-muted">Total Return</p>
                  <p className={cn('font-bold text-xl', portfolioSummary.totalGainLossPercent >= 0 ? 'text-green-600' : 'text-red-600')}>
                    {portfolioSummary.totalGainLossPercent >= 0 ? '+' : ''}{portfolioSummary.totalGainLossPercent.toFixed(2)}%
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50">
                  <p className="text-muted">Day Change</p>
                  <p className={cn('font-bold text-xl', portfolioSummary.dayChange >= 0 ? 'text-green-600' : 'text-red-600')}>
                    {portfolioSummary.dayChange >= 0 ? '+' : ''}{formatCurrency(portfolioSummary.dayChange)} ({portfolioSummary.dayChangePercent >= 0 ? '+' : ''}{portfolioSummary.dayChangePercent.toFixed(2)}%)
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50">
                  <p className="text-muted">vs Benchmark</p>
                  <p className="font-bold text-xl text-blue-600">{performanceData[performanceData.length - 1]?.portfolioReturn.toFixed(2) || 0}%</p>
                </div>
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50">
                  <p className="text-muted">Volatility</p>
                  <p className="font-bold text-xl text-muted">12.4%</p>
                </div>
              </div>
            </Card>
          </div>

          {/* Holdings Tab */}
          <TabsContent value="holdings">
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="flex items-center gap-2">
                  <Input
                    placeholder="Search holdings..."
                    value={filters.sector}
                    onChange={(e) => setFilters({ ...filters, sector: e.target.value })}
                    className="w-64"
                    placeholder="Filter by sector..."
                  />
                  <Select value={sortBy} onValueChange={setSortBy} className="w-40">
                    <SelectTrigger className="w-full"><SelectValue placeholder="Sort By" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="value">Value</SelectItem>
                      <SelectItem value="gainLoss">Gain/Loss $</SelectItem>
                      <SelectItem value="gainLossPercent">Gain/Loss %</SelectItem>
                      <SelectItem value="allocation">Allocation %</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button variant="outline" size="sm" onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}>
                    {sortOrder === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </Button>
                </div>

                <Card>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="cursor-pointer" onClick={() => handleSort('symbol')}>
                              Symbol {sortBy === 'symbol' && (sortOrder === 'asc' ? '↑' : '↓')}
                            </TableHead>
                            <TableHead>Name</TableHead>
                            <TableHead>Sector</TableHead>
                            <TableHead className="text-right" onClick={() => handleSort('quantity')}>Qty</TableHead>
                            <TableHead className="text-right" onClick={() => handleSort('avgCost')}>Avg Cost</TableHead>
                            <TableHead className="text-right" onClick={() => handleSort('currentPrice')}>Price</TableHead>
                            <TableHead className="text-right" onClick={() => handleSort('value')}>Value</TableHead>
                            <TableHead className="text-right" onClick={() => handleSort('gainLoss')}>Gain/Loss</TableHead>
                            <TableHead className="text-right" onClick={() => handleSort('gainLossPercent')}>Gain/Loss %</TableHead>
                            <TableHead className="text-right" onClick={() => handleSort('allocation')}>Alloc %</TableHead>
                            <TableHead>1D</TableHead>
                            <TableHead>7D</TableHead>
                            <TableHead>30D</TableHead>
                            <TableHead>Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredHoldings.map((holding) => (
                            <TableRow key={holding.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                              <TableCell className="font-mono font-medium text-text">{holding.symbol}</TableCell>
                              <TableCell className="text-sm text-muted">{holding.name}</TableCell>
                              <TableCell><Badge variant="default">{holding.sector}</Badge></TableCell>
                              <TableCell className="text-right font-mono">{holding.quantity}</TableCell>
                              <TableCell className="text-right text-muted font-mono">{formatCurrency(holding.avgCost)}</TableCell>
                              <TableCell className="text-right font-mono font-medium">{formatCurrency(holding.currentPrice)}</TableCell>
                              <TableCell className="text-right font-semibold">{formatCurrency(holding.value)}</TableCell>
                              <TableCell className="text-right">
                                <span className={cn('font-mono', holding.gainLoss >= 0 ? 'text-green-600' : 'text-red-600')}>
                                  {holding.gainLoss >= 0 ? '+' : ''}{formatCurrency(holding.gainLoss)}
                                </span>
                              </TableCell>
                              <TableCell className="text-right">
                                <span className={cn('font-mono', holding.gainLossPercent >= 0 ? 'text-green-600' : 'text-red-600')}>
                                  {holding.gainLossPercent >= 0 ? '+' : ''}{holding.gainLossPercent.toFixed(2)}%
                                </span>
                              </TableCell>
                              <TableCell className="text-right font-medium">{holding.allocation.toFixed(1)}%</TableCell>
                              <TableCell className={cn('text-center', holding.change1d >= 0 ? 'text-green-600' : 'text-red-600')}>
                                {holding.change1d >= 0 ? '+' : ''}{holding.change1d.toFixed(2)}%
                              </TableCell>
                              <TableCell className={cn('text-center', holding.change7d >= 0 ? 'text-green-600' : 'text-red-600')}>
                                {holding.change7d >= 0 ? '+' : ''}{holding.change7d.toFixed(2)}%
                              </TableCell>
                              <TableCell className={cn('text-center', holding.change30d >= 0 ? 'text-green-600' : 'text-red-600')}>
                                {holding.change30d >= 0 ? '+' : ''}{holding.change30d.toFixed(2)}%
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button variant="ghost" size="icon" onClick={() => { setTradeType('buy'); setTradeForm({ symbol: holding.symbol, quantity: 0, price: holding.currentPrice, orderType: 'market', timeInForce: 'day' }); setShowTradeModal(true); }}>
                                        <TrendingUp className="w-4 h-4" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent side="top">Buy</TooltipContent>
                                  </Tooltip>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button variant="ghost" size="icon" onClick={() => { setTradeType('sell'); setTradeForm({ symbol: holding.symbol, quantity: holding.quantity, price: holding.currentPrice, orderType: 'market', timeInForce: 'day' }); setShowTradeModal(true); }}>
                                        <TrendingDownIcon className="w-4 h-4" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent side="top">Sell</TooltipContent>
                                  </Tooltip>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button variant="ghost" size="icon" onClick={() => setSelectedHolding(holding)}>
                                        <Eye className="w-4 h-4" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent side="top">Details</TooltipContent>
                                  </Tooltip>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Performance Tab */}
              <TabsContent value="performance">
                <div className="space-y-6">
                  <Card className="lg:col-span-2">
                    <CardHeader>
                      <CardTitle>Portfolio vs Benchmark</CardTitle>
                      <CardDescription>Performance comparison over time</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <LineChartComponent
                        data={performanceData}
                        xKey="date"
                        lines={[
                          { key: 'portfolioValue', color: '#2563eb', name: 'Portfolio' },
                          { key: 'benchmarkValue', color: '#94a3b8', name: 'S&P 500' },
                        ]}
                        height={400}
                      />
                    </CardContent>
                  </Card>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <MetricCard
                      label="Total Return"
                      value={`${performanceData[performanceData.length - 1]?.portfolioReturn.toFixed(2) || 0}%`}
                      change={performanceData[performanceData.length - 1]?.portfolioReturn || 0}
                      trend={performanceData[performanceData.length - 1]?.portfolioReturn >= 0 ? 'up' : 'down'}
                      icon={<TrendingUp className="w-5 h-5" />}
                      color="bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400"
                    />
                    <MetricCard
                      label="Annualized Return"
                      value="18.5%"
                      change={2.3}
                      trend="up"
                      icon={<TrendingUp className="w-5 h-5" />}
                      color="bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400"
                    />
                    <MetricCard
                      label="Sharpe Ratio"
                      value="1.85"
                      change={0.12}
                      trend="up"
                      icon={<Target className="w-5 h-5" />}
                      color="bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400"
                    />
                    <MetricCard
                      label="Max Drawdown"
                      value="-8.2%"
                      change={-1.2}
                      trend="down"
                      icon={<TrendingDownIcon className="w-5 h-5" />}
                      color="bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400"
                    />
                  </div>
                </TabsContent>

                {/* Orders Tab */}
                <TabsContent value="orders">
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between">
                      <div>
                        <CardTitle>Order History</CardTitle>
                        <CardDescription>Track your buy and sell orders</CardDescription>
                      </div>
                      <Button variant="outline" size="sm" leftIcon={<Plus className="w-4 h-4" />}>New Order</Button>
                    </CardHeader>
                    <CardContent>
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Date</TableHead>
                              <TableHead>Symbol</TableHead>
                              <TableHead>Side</TableHead>
                              <TableHead>Type</TableHead>
                              <TableHead className="text-right">Quantity</TableHead>
                              <TableHead className="text-right">Price</TableHead>
                              <TableHead className="text-right">Amount</TableHead>
                              <TableHead>Status</TableHead>
                              <TableHead>Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {[
                              { date: '2024-01-15', symbol: 'AAPL', side: 'buy', type: 'market', qty: 10, price: 172.50, amount: 1725.00, status: 'filled' },
                              { date: '2024-01-14', symbol: 'MSFT', side: 'buy', type: 'limit', qty: 5, price: 305.00, amount: 1525.00, status: 'filled' },
                              { date: '2024-01-13', symbol: 'TSLA', side: 'sell', type: 'market', qty: 3, price: 240.00, amount: 720.00, status: 'filled' },
                              { date: '2024-01-12', symbol: 'NVDA', side: 'buy', type: 'stop', qty: 2, price: 470.00, amount: 940.00, status: 'pending' },
                              { date: '2024-01-11', symbol: 'GOOGL', side: 'sell', type: 'limit', qty: 5, price: 138.00, amount: 690.00, status: 'cancelled' },
                            ].map((order) => (
                              <TableRow key={order.date + order.symbol}>
                                <TableCell>{order.date}</TableCell>
                                <TableCell className="font-mono font-medium">{order.symbol}</TableCell>
                                <TableCell>
                                  <Badge variant={order.side === 'buy' ? 'success' : 'danger'}>
                                    {order.side.toUpperCase()}
                                  </Badge>
                                </TableCell>
                                <TableCell><Badge variant="outline">{order.type}</Badge></TableCell>
                                <TableCell className="text-right">{order.qty}</TableCell>
                                <TableCell className="text-right font-mono">{formatCurrency(order.price)}</TableCell>
                                <TableCell className="text-right font-mono">{formatCurrency(order.amount)}</TableCell>
                                <TableCell>
                                  <Badge variant={
                                    order.status === 'filled' ? 'success' :
                                    order.status === 'pending' ? 'warning' :
                                    'gray'
                                  }>
                                    {order.status}
                                  </Badge>
                                </TableCell>
                                <TableCell>
                                  {order.status === 'pending' && (
                                    <Button variant="ghost" size="icon" className="text-red-600">
                                      <X className="w-4 h-4" />
                                    </Button>
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

                {/* Settings Tab */}
                <TabsContent value="settings">
                  <div className="space-y-6">
                    <Card>
                      <CardHeader>
                        <CardTitle>Trading Preferences</CardTitle>
                        <CardDescription>Configure your default trading settings</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <Label>Default Order Type</Label>
                            <Select defaultValue="market">
                              <SelectTrigger><SelectValue placeholder="market" /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="market">Market</SelectItem>
                                <SelectItem value="limit">Limit</SelectItem>
                                <SelectItem value="stop">Stop</SelectItem>
                                <SelectItem value="stop_limit">Stop Limit</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label>Default Time in Force</Label>
                            <Select defaultValue="day">
                              <SelectTrigger><SelectValue placeholder="day" /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="day">Day</SelectItem>
                                <SelectItem value="gtc">Good Till Cancelled</SelectItem>
                                <SelectItem value="ioc">Immediate or Cancel</SelectItem>
                                <SelectItem value="fok">Fill or Kill</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 p-4 rounded-lg border border-border">
                          <Switch checked={true} />
                          <div>
                            <p className="font-medium text-text">Confirm before placing orders</p>
                            <p className="text-sm text-muted">Require confirmation before executing trades</p>
                          </div>
                        </div>
                        <div className="flex items-center justify-between p-4 rounded-lg border border-border">
                          <div>
                            <p className="font-medium text-text">Fractional Shares</p>
                            <p className="text-sm text-muted">Allow buying fractional shares</p>
                          </div>
                          <Switch checked={true} />
                        </div>
                        <div className="flex items-center justify-between p-4 rounded-lg border border-border">
                          <div>
                            <p className="font-medium text-text">Extended Hours Trading</p>
                            <p className="text-sm text-muted">Allow trading during pre-market and after-hours</p>
                          </div>
                          <Switch checked={false} />
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle>Risk Management</CardTitle>
                        <CardDescription>Set limits to manage your risk</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <Label>Max Position Size (%)</Label>
                            <Input type="number" value="10" min="1" max="100" className="w-full" />
                          </div>
                          <div>
                            <Label>Max Daily Loss (%)</Label>
                            <Input type="number" value="5" min="0.1" max="20" step="0.1" className="w-full" />
                          </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <Label>Stop Loss Default (%)</Label>
                            <Input type="number" value="10" min="0.1" max="50" step="0.1" className="w-full" />
                          </div>
                          <div>
                            <Label>Take Profit Default (%)</Label>
                            <Input type="number" value="20" min="1" max="100" step="0.1" className="w-full" />
                          </div>
                        </div>
                        <div className="flex items-center gap-3 p-4 rounded-lg border border-border">
                          <Switch checked={true} />
                          <div>
                            <p className="font-medium text-text">Enable Margin Trading</p>
                            <p className="text-sm text-muted">Trade with borrowed funds (increases risk)</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="border-red-200">
                      <CardHeader>
                        <CardTitle className="text-red-600 flex items-center gap-2">
                          <AlertTriangle className="w-5 h-5" />
                          Danger Zone
                        </CardTitle>
                        <CardDescription>Irreversible actions</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="p-4 rounded-lg border border-red-200 bg-red-50 dark:bg-red-900/20">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center text-red-600">
                              <Trash2 className="w-5 h-5" />
                            </div>
                            <div>
                              <p className="font-medium text-red-600">Close Account</p>
                              <p className="text-sm text-red-500">Permanently close your investment account. This cannot be undone.</p>
                            </div>
                          </div>
                          <Button variant="destructive" className="w-full">Close Account</Button>
                        </div>
                      </CardContent>
                    </Card>
                  </TabsContent>
                </Tabs>
              </div>
            );
          }
        </Tabs>
      </div>
    );
  );
}

// Trade order type
interface TradeOrder {
  symbol: string;
  side: 'buy' | 'sell';
  quantity: number;
  price: number;
  orderType: 'market' | 'limit' | 'stop' | 'stop_limit';
  timeInForce: 'day' | 'gtc' | 'ioc' | 'fok';
}

import { format } from 'date-fns';
import { Building2, ChevronUp, ChevronDown, CreditCard, DollarSign, ArrowDownLeft, ArrowUpRight, ArrowRightLeft, TrendingUp, TrendingDown, Target, Activity, Zap, BarChart3, PieChart, Target as TargetIcon, Filter, Download, Calendar, Clock, AlertTriangle, CheckCircle, XCircle, Info, ChevronLeft, ChevronRight, Maximize2, Minimize2, Settings, Search, X, Shield, Lock, Key, Eye, EyeOff, Moon, Sun, Monitor, Smartphone, Globe, AlertCircle, CheckCircle, XCircle, TrendingDown, Plus, Minus, PieChart, BarChart2, LineChart, Activity as ActivityIcon, Target as TargetIcon2, Zap as ZapIcon2, AlertTriangle, RotateCcw, Copy, Mail, XCircle, CheckCircle, Shield, Lock, Fingerprint, QrCode, BarChart2, FileText } from 'lucide-react';