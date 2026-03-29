'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, AlertCircle, XCircle, Database, Globe, Settings, Cpu } from 'lucide-react';
import { getHealth, type HealthResponse } from '@/shared/api';
import { WalletButton } from '@/features/wallet/ui/WalletButton';

type HealthStatus = 'healthy' | 'degraded' | 'unhealthy';

interface SystemHealthBarProps {
  onAdminClick?: () => void;
}

function HealthDot({ status }: { status: HealthStatus }) {
  const color = status === 'healthy'
    ? 'bg-status-confirmed'
    : status === 'degraded'
    ? 'bg-status-pending'
    : 'bg-status-failed';
  return <span className={`h-1.5 w-1.5 rounded-full ${color} inline-block`} />;
}

function HealthIndicator({ status, label, icon }: {
  status: HealthStatus;
  label: string;
  icon: React.ReactNode;
}) {
  const color = status === 'healthy'
    ? 'text-status-confirmed'
    : status === 'degraded'
    ? 'text-status-pending'
    : 'text-status-failed';

  return (
    <div className="flex items-center gap-1.5">
      <span className={color}>{icon}</span>
      <span className="text-xs text-muted hidden md:inline">{label}</span>
      <HealthDot status={status} />
    </div>
  );
}

export function SystemHealthBar({ onAdminClick }: SystemHealthBarProps = {}) {
  const [health, setHealth] = useState<HealthResponse | null>(null);

  useEffect(() => {
    const fetch_ = async () => {
      try {
        const data = await getHealth();
        setHealth(data);
      } catch {
        // show as unhealthy
      }
    };
    fetch_();
    const interval = setInterval(fetch_, 30_000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="sticky top-0 z-50 w-full bg-panel/95 backdrop-blur-sm border-b border-border">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-12">

          {/* Left — Branding */}
          <div className="flex items-center gap-3">
            {/* Logo mark */}
            <div className="flex items-center justify-center h-7 w-7 rounded-lg bg-gradient-primary">
              <span className="text-white font-bold text-xs">O</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-foreground tracking-tight">Oragami</span>
              <span className="hidden sm:inline text-xs text-muted-dark">·</span>
              <span className="hidden sm:inline text-xs text-muted">Institutional RWA Vault</span>
            </div>
            {/* Devnet badge */}
            <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-status-pending/15 text-status-pending border border-status-pending/30">
              DEVNET
            </span>
          </div>

          {/* Right — Health + Wallet + Admin */}
          <div className="flex items-center gap-4">
            {/* Health indicators */}
            <div className="hidden sm:flex items-center gap-4">
              <HealthIndicator
                status={health?.database ?? 'unhealthy'}
                label="DB"
                icon={<Database className="h-3 w-3" />}
              />
              <HealthIndicator
                status={health?.blockchain ?? 'unhealthy'}
                label="RPC"
                icon={<Globe className="h-3 w-3" />}
              />
              <HealthIndicator
                status="healthy"
                label="SIX"
                icon={<Cpu className="h-3 w-3" />}
              />
            </div>

            <div className="h-4 w-px bg-border hidden sm:block" />

            {/* Wallet connect */}
            <WalletButton />

            {/* Admin */}
            {onAdminClick && (
              <button
                onClick={onAdminClick}
                className="p-1.5 rounded-md hover:bg-panel-hover transition-colors group"
                title="Admin Panel"
              >
                <Settings className="h-4 w-4 text-muted group-hover:text-primary transition-colors" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
