'use client';

import { usePathname } from 'next/navigation';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

const STEPS = [
  { label: 'Connect', href: '/onboard/connect' },
  { label: 'Register', href: '/onboard/register' },
  { label: 'Pending', href: '/onboard/pending' },
  { label: 'Complete', href: '/onboard/complete' },
];

export default function OnboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const currentStep = STEPS.findIndex((s) => pathname.startsWith(s.href));

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b border-foreground/10">
        <div className="max-w-2xl mx-auto px-6 py-4 flex items-center justify-between">
          <a href="/" className="font-display text-xl tracking-tight">
            Oragami
          </a>
          <span className="font-mono text-xs text-muted-foreground uppercase tracking-widest">
            Onboarding
          </span>
        </div>
      </header>

      {/* Step progress */}
      <div className="max-w-2xl mx-auto w-full px-6 pt-8">
        <div className="flex items-center justify-between">
          {STEPS.map((step, i) => {
            const isCompleted = i < currentStep;
            const isCurrent = i === currentStep;
            return (
              <div key={step.href} className="flex items-center flex-1 last:flex-none">
                <div className="flex flex-col items-center gap-1.5">
                  <div
                    className={cn(
                      'size-8 rounded-full flex items-center justify-center border text-xs font-mono transition-colors',
                      isCompleted && 'bg-foreground text-background border-foreground',
                      isCurrent && 'border-foreground text-foreground',
                      !isCompleted && !isCurrent && 'border-foreground/20 text-foreground/30',
                    )}
                  >
                    {isCompleted ? <Check className="size-4" /> : i + 1}
                  </div>
                  <span
                    className={cn(
                      'text-xs font-mono uppercase tracking-wider',
                      isCurrent && 'text-foreground',
                      isCompleted && 'text-foreground/60',
                      !isCompleted && !isCurrent && 'text-foreground/30',
                    )}
                  >
                    {step.label}
                  </span>
                </div>
                {i < STEPS.length - 1 && (
                  <div
                    className={cn(
                      'h-px flex-1 mx-3 mt-[-1rem]',
                      isCompleted ? 'bg-foreground' : 'bg-foreground/10',
                    )}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <main className="flex-1 flex items-start justify-center pt-12 px-6">
        <div className="w-full max-w-md">{children}</div>
      </main>
    </div>
  );
}
