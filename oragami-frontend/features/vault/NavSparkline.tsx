'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  YAxis,
  Tooltip,
} from 'recharts';
import { getNavHistory, type NavSnapshot } from '@/shared/api';

function navBpsToDisplay(bps: string | number): number {
  const n = typeof bps === 'string' ? parseInt(bps, 10) : bps;
  return n / 10_000;
}

interface SparklinePoint {
  time: number;
  nav: number;
}

interface NavSparklineProps {
  refreshInterval?: number;
}

export function NavSparkline({ refreshInterval = 60_000 }: NavSparklineProps) {
  const [data, setData] = useState<SparklinePoint[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchHistory = useCallback(async () => {
    try {
      const snapshots = await getNavHistory(100);
      const points: SparklinePoint[] = snapshots
        .slice()
        .reverse()
        .map((s: NavSnapshot) => ({
          time: new Date(s.timestamp).getTime(),
          nav: navBpsToDisplay(s.navBps),
        }));
      setData(points);
    } catch {
      // silently fail — sparkline is non-critical
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHistory();
    const interval = setInterval(fetchHistory, refreshInterval);
    return () => clearInterval(interval);
  }, [fetchHistory, refreshInterval]);

  const { min, max, trend } = useMemo(() => {
    if (data.length < 2) return { min: 0, max: 0, trend: 0 };
    const values = data.map((d) => d.nav);
    const mn = Math.min(...values);
    const mx = Math.max(...values);
    const pad = Math.max((mx - mn) * 0.1, 0.0001);
    const first = values[0];
    const last = values[values.length - 1];
    return { min: mn - pad, max: mx + pad, trend: last - first };
  }, [data]);

  if (isLoading || data.length < 2) {
    return (
      <div className="h-10 w-32 animate-pulse rounded bg-foreground/5" />
    );
  }

  const strokeColor = trend >= 0 ? '#22c55e' : '#ef4444';

  return (
    <div className="h-10 w-40">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 2, right: 0, bottom: 2, left: 0 }}>
          <defs>
            <linearGradient id="navGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={strokeColor} stopOpacity={0.3} />
              <stop offset="100%" stopColor={strokeColor} stopOpacity={0} />
            </linearGradient>
          </defs>
          <YAxis domain={[min, max]} hide />
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const val = payload[0].value as number;
              const ts = payload[0].payload.time as number;
              return (
                <div className="rounded border border-foreground/10 bg-background px-2 py-1 text-xs shadow-lg">
                  <div className="font-mono font-medium">${val.toFixed(4)}</div>
                  <div className="text-muted-foreground">
                    {new Date(ts).toLocaleTimeString()}
                  </div>
                </div>
              );
            }}
          />
          <Area
            type="monotone"
            dataKey="nav"
            stroke={strokeColor}
            strokeWidth={1.5}
            fill="url(#navGrad)"
            dot={false}
            animationDuration={600}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
