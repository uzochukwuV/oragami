'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Check, Loader2, Circle } from 'lucide-react';

const SCAN_STEPS = [
  { id: 'blocklist', label: 'Internal Blocklist', duration: 1000 },
  { id: 'range', label: 'Range Protocol Risk API', duration: 1500 },
  { id: 'helius', label: 'Helius DAS Asset Scan', duration: 1000 },
];

export function ScanningProgress({ isBlocked, onComplete }: { isBlocked: boolean; onComplete: () => void }) {
  const [currentStep, setCurrentStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());

  const stepsToAnimate = isBlocked ? 1 : SCAN_STEPS.length;
  const totalDuration = SCAN_STEPS.slice(0, stepsToAnimate).reduce((s, step) => s + step.duration, 0);
  const elapsed = SCAN_STEPS.slice(0, currentStep).reduce((s, step) => s + step.duration, 0);
  const progress = Math.min((elapsed / totalDuration) * 100, 100);

  useEffect(() => {
    if (currentStep >= stepsToAnimate) {
      const t = setTimeout(onComplete, 300);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => {
      setCompletedSteps((prev) => new Set([...prev, currentStep]));
      setCurrentStep((prev) => prev + 1);
    }, SCAN_STEPS[currentStep].duration);
    return () => clearTimeout(t);
  }, [currentStep, stepsToAnimate, onComplete]);

  return (
    <div className="space-y-6">
      {/* Progress bar */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="font-mono text-xs tracking-widest uppercase">Scanning</span>
          <span className="font-mono text-xs text-muted-foreground">{Math.round(progress)}%</span>
        </div>
        <div className="h-px bg-foreground/10 overflow-hidden">
          <motion.div
            className="h-full bg-foreground"
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
          />
        </div>
      </div>

      {/* Steps */}
      <div className="space-y-3">
        {SCAN_STEPS.map((step, index) => {
          const isCompleted = completedSteps.has(index);
          const isActive = index === currentStep && !isCompleted;
          const isSkipped = isBlocked && index > 0;

          return (
            <div key={step.id} className={`flex items-center gap-3 ${isSkipped ? 'opacity-20' : ''}`}>
              <div className="w-4 h-4 flex items-center justify-center shrink-0">
                {isCompleted
                  ? <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}><Check className="h-4 w-4" /></motion.div>
                  : isActive
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <Circle className="h-4 w-4 text-foreground/20" />
                }
              </div>
              <span className={`font-mono text-xs flex-1 ${isActive ? '' : isCompleted ? '' : 'text-muted-foreground'}`}>
                {step.label}
              </span>
              <span className="font-mono text-xs text-muted-foreground">
                {isCompleted ? (isBlocked && index === 0 ? 'blocked' : 'clean') : isActive ? 'scanning...' : 'pending'}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
