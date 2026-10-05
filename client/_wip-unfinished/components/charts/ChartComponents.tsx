import { useEffect, useRef, useMemo } from 'react';
import { cn } from '../../utils/cn';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  LineChart, Line, AreaChart, Area, PieChart, Pie, Cell, 
  RadarChart, Radar, PolarAngleAxis, PolarRadiusAxis,
  ScatterChart, Scatter,
  ComposedChart,
  Legend
} from 'recharts';
import { formatCurrency } from '../../utils/format';

interface ChartData {
  name: string;
  [key: string]: string | number;
}

interface ChartProps {
  data: ChartData[];
  width?: number | string;
  height?: number | string;
  className?: string;
  title?: string;
  subtitle?: string;
}

export function BarChartComponent({ 
  data, 
  xKey = 'name', 
  yKeys = ['value'], 
  colors = ['#2563eb', '#16a34a', '#ea580c', '#9333ea', '#ea580c'],
  width = '100%', 
  height = 300,
  className,
  title,
  subtitle,
  ...props
}: {
  data: ChartData[];
  xKey?: string;
  yKeys?: string[];
  colors?: string[];
  width?: number | string;
  height?: number;
  className?: string;
  title?: string;
  subtitle?: string;
}) {
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white dark:bg-slate-800 p-3 rounded-lg shadow-lg border border-border">
          <p className="font-medium text-text mb-2">{label}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} className="text-sm" style={{ color: colors[index % colors.length] }}>
              {entry.name}: {typeof entry.value === 'number' ? entry.value.toLocaleString() : entry.value}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className={cn('w-full', className)}>
      {(title || subtitle) && (
        <div className="mb-4">
          {title && <h3 className="text-lg font-semibold text-text">{title}</h3>}
          {subtitle && <p className="text-sm text-muted">{subtitle}</p>}
        </div>
      )}
      <div style={{ width, height }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} {...props}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis 
              dataKey={xKey} 
              tick={{ fontSize: 12, fill: '#64748b' }}
              axisLine={{ stroke: '#e2e8f0' }}
            />
            <YAxis 
              tick={{ fontSize: 12, fill: '#64748b' }}
              axisLine={false}
              tickFormatter={(value) => value >= 1000 ? `${(value/1000).toFixed(1)}k` : value}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend />
            {yKeys.map((key, index) => (
              <Bar 
                key={key} 
                dataKey={key} 
                fill={colors[index % colors.length]}
                radius={[4, 4, 0, 0]}
                maxBarWidth={50}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function LineChartComponent({ 
  data, 
  xKey = 'name', 
  lines = [{ key: 'value', color: '#2563eb', name: 'Value' }],
  width = '100%', 
  height = 300,
  className,
  title,
  subtitle,
  showArea = false,
  ...props
}: {
  data: ChartData[];
  xKey?: string;
  lines?: Array<{ key: string; color: string; name: string; strokeWidth?: number }>;
  width?: number | string;
  height?: number;
  className?: string;
  title?: string;
  subtitle?: string;
  showArea?: boolean;
}) {
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white dark:bg-slate-800 p-3 rounded-lg shadow-lg border border-border">
          <p className="font-medium text-text mb-2">{label}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} className="text-sm" style={{ color: lines[index]?.color || '#2563eb' }}>
              {entry.name}: {typeof entry.value === 'number' ? entry.value.toLocaleString() : entry.value}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className={cn('w-full', className)}>
      {(title || subtitle) && (
        <div className="mb-4">
          {title && <h3 className="text-lg font-semibold text-text">{title}</h3>}
          {subtitle && <p className="text-sm text-muted">{subtitle}</p>}
        </div>
      )}
      <div style={{ width, height }}>
        <ResponsiveContainer width="100%" height="100%">
          {showArea ? (
            <AreaChart data={data} {...props}>
              <defs>
                {lines.map((line, index) => (
                  <linearGradient key={line.key} id={`colorArea${line.key}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={line.color} stopOpacity={0.3}/>
                    <stop offset="95%" stopColor={line.color} stopOpacity={0}/>
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis 
                dataKey={xKey} 
                tick={{ fontSize: 12, fill: '#64748b' }}
                axisLine={{ stroke: '#e2e8f0' }}
              />
              <YAxis 
                tick={{ fontSize: 12, fill: '#64748b' }}
                axisLine={false}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              {lines.map((line, index) => (
                <Area
                  key={line.key}
                  type="monotone"
                  dataKey={line.key}
                  stroke={line.color}
                  strokeWidth={line.strokeWidth || 2}
                  fill={`url(#colorArea${line.key})`}
                  name={line.name}
                />
              )}
            </AreaChart>
          ) : (
            <LineChart data={data} {...props}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis 
                dataKey={xKey} 
                tick={{ fontSize: 12, fill: '#64748b' }}
                axisLine={{ stroke: '#e2e8f0' }}
              />
              <YAxis 
                tick={{ fontSize: 12, fill: '#64748b' }}
                axisLine={false}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              {lines.map((line, index) => (
                <Line
                  key={line.key}
                  type="monotone"
                  dataKey={line.key}
                  stroke={line.color}
                  strokeWidth={line.strokeWidth || 2}
                  dot={{ r: 4 }}
                  activeDot={{ r: 6 }}
                  name={line.name}
                />
              ))}
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function PieChartComponent({ 
  data, 
  nameKey = 'name', 
  valueKey = 'value',
  colors = ['#2563eb', '#16a34a', '#ea580c', '#9333ea', '#ea580c', '#0891b2', '#65a30d', '#dc2626'],
  width = '100%', 
  height = 300,
  className,
  title,
  subtitle,
  innerRadius = 60,
  showLabels = true,
  ...props
}: {
  data: ChartData[];
  nameKey?: string;
  valueKey?: string;
  colors?: string[];
  width?: number | string;
  height?: number;
  className?: string;
  title?: string;
  subtitle?: string;
  innerRadius?: number;
  showLabels?: boolean;
}) {
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const entry = payload[0];
      const total = data.reduce((sum, d) => sum + (d[valueKey] as number), 0);
      const percentage = ((entry.value as number) / total * 100).toFixed(1);
      return (
        <div className="bg-white dark:bg-slate-800 p-3 rounded-lg shadow-lg border border-border">
          <p className="font-medium text-text mb-1">{entry.payload[nameKey]}</p>
          <p className="text-sm text-muted">{formatCurrency(entry.value as number)} ({percentage}%)</p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className={cn('w-full', className)}>
      {(title || subtitle) && (
        <div className="mb-4">
          {title && <h3 className="text-lg font-semibold text-text">{title}</h3>}
          {subtitle && <p className="text-sm text-muted">{subtitle}</p>}
        </div>
      )}
      <div style={{ width, height }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart {...props}>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={innerRadius}
              outerRadius={Math.min(200, Math.min(300, 300) - 40)}
              paddingAngle={2}
              dataKey={valueKey}
              nameKey={nameKey}
              label={showLabels ? ({ name, percent }) => (
                <span className="text-sm font-medium">{name} {(percent * 100).toFixed(0)}%</span>
              ) : false}
              labelLine={showLabels}
            >
              {data.map((entry, index) => (
                <Cell key={`${entry[nameKey]}-${index}`} fill={colors[index % colors.length]} />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function RadarChartComponent({ 
  data, 
  indicators,
  colors = ['#2563eb', '#16a34a', '#ea580c'],
  width = '100%', 
  height = 300,
  className,
  title,
  subtitle,
  ...props
}: {
  data: Array<{ [key: string]: number }>;
  indicators: Array<{ name: string; max: number; unit?: string }>;
  colors?: string[];
  width?: number | string;
  height?: number;
  className?: string;
  title?: string;
  subtitle?: string;
}) {
  const maxValues = indicators.map(i => i.max);
  const indicatorNames = indicators.map(i => i.name);

  return (
    <div className={cn('w-full', className)}>
      {(title || subtitle) && (
        <div className="mb-4">
          {title && <h3 className="text-lg font-semibold text-text">{title}</h3>}
          {subtitle && <p className="text-sm text-muted">{subtitle}</p>}
        </div>
      )}
      <div style={{ width, height }}>
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={data} radar={{ maxValue: Math.max(...maxValues) }} {...props}>
            <PolarGrid />
            <PolarAngleAxis 
              tick={{ fontSize: 12, fill: '#64748b' }}
              tickFormatter={(value) => indicatorNames[value as number] || ''}
            />
            <PolarRadiusAxis 
              tick={{ fontSize: 10, fill: '#64748b' }}
              axisLine={false}
              domain={[0, Math.max(...maxValues)]}
            />
            <Tooltip />
            <Legend />
            {data.map((entry, index) => (
              <Radar 
                key={index} 
                data={[entry]} 
                stroke={colors[index % colors.length]} 
                fill={colors[index % colors.length]} 
                fillOpacity={0.1}
                strokeWidth={2}
              />
            )}
          </RadarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function ComposedChartComponent({ 
  data, 
  xKey = 'name',
  bars = [{ key: 'bar', color: '#2563eb', name: 'Bars' }],
  lines = [{ key: 'line', color: '#ea580c', name: 'Line' }],
  width = '100%', 
  height = 300,
  className,
  title,
  subtitle,
  ...props
}: {
  data: ChartData[];
  xKey?: string;
  bars?: Array<{ key: string; color: string; name: string }>;
  lines?: Array<{ key: string; color: string; name: string }>;
  width?: number | string;
  height?: number;
  className?: string;
  title?: string;
  subtitle?: string;
}) {
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white dark:bg-slate-800 p-3 rounded-lg shadow-lg border border-border">
          <p className="font-medium text-text mb-2">{label}</p>
          {payload.map((entry: any) => (
            <p key={entry.dataKey} className="text-sm" style={{ color: entry.color }}>
              {entry.name}: {typeof entry.value === 'number' ? entry.value.toLocaleString() : entry.value}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className={cn('w-full', className)}>
      {(title || subtitle) && (
        <div className="mb-4">
          {title && <h3 className="text-lg font-semibold text-text">{title}</h3>}
          {subtitle && <p className="text-sm text-muted">{subtitle}</p>}
        </div>
      )}
      <div style={{ width, height }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} {...props}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis 
              dataKey={xKey} 
              tick={{ fontSize: 12, fill: '#64748b' }}
              axisLine={{ stroke: '#e2e8f0' }}
            />
            <YAxis 
              yAxisId="left"
              tick={{ fontSize: 12, fill: '#64748b' }}
              axisLine={false}
            />
            <YAxis 
              yAxisId="right"
              orientation="right"
              tick={{ fontSize: 12, fill: '#64748b' }}
              axisLine={false}
            />
            <Tooltip content={({ active, payload, label }: any) => {
              if (active && payload && payload.length) {
                return (
                  <div className="bg-white dark:bg-slate-800 p-3 rounded-lg shadow-lg border border-border">
                    <p className="font-medium text-text mb-2">{label}</p>
                    {payload.map((entry: any) => (
                      <p key={entry.dataKey} className="text-sm" style={{ color: entry.color }}>
                        {entry.name}: {typeof entry.value === 'number' ? entry.value.toLocaleString() : entry.value}
                      </p>
                    ))}
                  </div>
                );
              }
              return null;
            }} />
            <Legend />
            {bars.map((bar, index) => (
              <Bar 
                key={bar.key} 
                yAxisId="left"
                dataKey={bar.key} 
                fill={bar.color}
                radius={[4, 4, 0, 0]}
                maxBarWidth={40}
                name={bar.name}
              />
            ))}
            {lines.map((line, index) => (
              <Line
                key={line.key}
                yAxisId="right"
                type="monotone"
                dataKey={line.key}
                stroke={line.color}
                strokeWidth={2}
                dot={{ r: 4 }}
                activeDot={{ r: 6 }}
                name={line.name}
              />
            ))}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// Sparkline charts for compact display
export function SparklineChart({ 
  data, 
  color = '#2563eb', 
  width = 100, 
  height = 30,
  showArea = true,
  className
}: {
  data: number[];
  color?: string;
  width?: number;
  height?: number;
  showArea?: boolean;
  className?: string;
}) {
  const chartData = data.map((value, index) => ({ value, index }));

  return (
    <div style={{ width, height }} className={cn('w-full', className)}>
      <ResponsiveContainer width="100%" height="100%">
        {showArea ? (
          <AreaChart data={chartData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="sparklineArea" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={color} stopOpacity={0.3}/>
                <stop offset="95%" stopColor={color} stopOpacity={0}/>
              </linearGradient>
            </defs>
            <Area
              type="monotone"
              dataKey="value"
              stroke={color}
              strokeWidth={1.5}
              fill="url(#sparklineArea)"
            />
          </AreaChart>
        ) : (
          <LineChart data={chartData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
            <Line
              type="monotone"
              dataKey="value"
              stroke={color}
              strokeWidth={1.5}
              dot={false}
            />
          </LineChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

// Metric card with sparkline
export function MetricCard({ 
  label, 
  value, 
  change, 
  trend: trendProp, 
  sparklineData, 
  icon, 
  color = '#2563eb',
  className 
}: {
  label: string;
  value: string | number;
  change?: number;
  trend?: 'up' | 'down' | 'neutral';
  sparklineData?: number[];
  icon?: React.ReactNode;
  color?: string;
  className?: string;
}) {
  const trend = trendProp || (change !== undefined ? (change >= 0 ? 'up' : 'down') : 'neutral');
  const changeColor = trend === 'up' ? 'text-green-600' : trend === 'down' ? 'text-red-600' : 'text-muted';

  return (
    <div className={cn('card p-6 hover:shadow-card-hover transition-shadow duration-200', className)}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center', `bg-${color.replace('#', '')}/10 text-${color.replace('#', '')}`)}>
            {icon}
          </div>
          <span className="text-sm text-muted">{label}</span>
        </div>
      </div>
      <div className="flex items-baseline gap-2 mb-2">
        <span className="text-3xl font-bold text-text">{value}</span>
        {change !== undefined && (
          <span className={cn('text-sm font-medium', changeColor)}>
            {change >= 0 ? '+' : ''}{change.toFixed(1)}%
          </span>
        )}
      </div>
      {sparklineData && (
        <div className="mt-2">
          <SparklineChart 
            data={sparklineData} 
            color={trend === 'up' ? '#16a34a' : trend === 'down' ? '#dc2626' : '#64748b'} 
            height={30}
          />
        </div>
      )}
    </div>
  );
}

// Import formatCurrency
import { formatCurrency } from '../../utils/format';