'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowRight, Loader2 } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { useWalletStore } from '@/features/wallet/model/store';
import { issueCredential, type IssueCredentialDto } from '@/shared/api';

const JURISDICTIONS = [
  { value: 'CH', label: 'Switzerland' },
  { value: 'DE', label: 'Germany' },
  { value: 'US', label: 'United States' },
  { value: 'GB', label: 'United Kingdom' },
  { value: 'SG', label: 'Singapore' },
  { value: 'AE', label: 'UAE' },
  { value: 'JP', label: 'Japan' },
] as const;

const formSchema = z.object({
  institutionName: z
    .string()
    .min(1, 'Institution name is required')
    .max(64, 'Max 64 characters'),
  jurisdiction: z.string().min(1, 'Jurisdiction is required'),
  tier: z.enum(['1', '2', '3'], { required_error: 'Select a tier' }),
  kycLevel: z.enum(['1', '2', '3'], { required_error: 'Select a KYC level' }),
  amlScore: z.number().min(0).max(100),
  expiresAt: z.string().refine(
    (val) => {
      const d = new Date(val);
      return !isNaN(d.getTime()) && d > new Date();
    },
    { message: 'Expiry date must be in the future' },
  ),
});

type FormValues = z.infer<typeof formSchema>;

export default function RegisterPage() {
  const router = useRouter();
  const publicKey = useWalletStore((s) => s.publicKey);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      institutionName: '',
      jurisdiction: '',
      tier: '2',
      kycLevel: '2',
      amlScore: 50,
      expiresAt: '',
    },
  });

  const amlScore = watch('amlScore');

  const onSubmit = async (data: FormValues) => {
    if (!publicKey) {
      setSubmitError('Wallet not connected. Go back and connect your wallet.');
      return;
    }

    const adminKey = process.env.NEXT_PUBLIC_ADMIN_API_KEY;
    if (!adminKey) {
      setSubmitError(
        'NEXT_PUBLIC_ADMIN_API_KEY not configured. Set it in .env.local',
      );
      return;
    }

    setSubmitting(true);
    setSubmitError(null);

    const dto: IssueCredentialDto = {
      wallet: publicKey,
      institutionName: data.institutionName,
      jurisdiction: data.jurisdiction,
      tier: Number(data.tier) as 1 | 2 | 3,
      kycLevel: Number(data.kycLevel) as 1 | 2 | 3,
      amlScore: data.amlScore,
      expiresAt: new Date(data.expiresAt).toISOString(),
    };

    try {
      await issueCredential(dto, adminKey);
      router.push('/onboard/pending');
    } catch (err: any) {
      setSubmitError(
        err?.body?.message || err?.message || 'Failed to issue credential',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card className="border-foreground/10">
      <CardHeader>
        <CardTitle className="font-display text-2xl">
          Institution Registration
        </CardTitle>
        <CardDescription>
          Provide your institution details to receive an on-chain credential
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-6">
          {/* Institution Name */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="institutionName">Institution Name</Label>
            <Input
              id="institutionName"
              placeholder="e.g. Acme Capital AG"
              maxLength={64}
              {...register('institutionName')}
              aria-invalid={!!errors.institutionName}
            />
            {errors.institutionName && (
              <p className="text-xs text-destructive-foreground">
                {errors.institutionName.message}
              </p>
            )}
          </div>

          {/* Jurisdiction */}
          <div className="flex flex-col gap-2">
            <Label>Jurisdiction</Label>
            <Select
              onValueChange={(val) => setValue('jurisdiction', val)}
              defaultValue=""
            >
              <SelectTrigger aria-invalid={!!errors.jurisdiction}>
                <SelectValue placeholder="Select jurisdiction" />
              </SelectTrigger>
              <SelectContent>
                {JURISDICTIONS.map((j) => (
                  <SelectItem key={j.value} value={j.value}>
                    {j.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.jurisdiction && (
              <p className="text-xs text-destructive-foreground">
                {errors.jurisdiction.message}
              </p>
            )}
          </div>

          {/* Tier */}
          <div className="flex flex-col gap-2">
            <Label>Tier</Label>
            <RadioGroup
              defaultValue="2"
              onValueChange={(val) => setValue('tier', val as '1' | '2' | '3')}
              className="grid grid-cols-3 gap-2"
            >
              {[
                { value: '1', label: 'Retail' },
                { value: '2', label: 'Professional' },
                { value: '3', label: 'Institutional' },
              ].map((t) => (
                <label
                  key={t.value}
                  className="flex items-center gap-2 border border-foreground/10 rounded-md px-3 py-2 cursor-pointer hover:border-foreground/30 transition-colors peer-aria-checked:border-foreground"
                >
                  <RadioGroupItem value={t.value} />
                  <span className="text-sm">{t.label}</span>
                </label>
              ))}
            </RadioGroup>
            {errors.tier && (
              <p className="text-xs text-destructive-foreground">
                {errors.tier.message}
              </p>
            )}
          </div>

          {/* KYC Level */}
          <div className="flex flex-col gap-2">
            <Label>KYC Level</Label>
            <RadioGroup
              defaultValue="2"
              onValueChange={(val) =>
                setValue('kycLevel', val as '1' | '2' | '3')
              }
              className="grid grid-cols-3 gap-2"
            >
              {[
                { value: '1', label: 'Basic' },
                { value: '2', label: 'Enhanced' },
                { value: '3', label: 'Full' },
              ].map((k) => (
                <label
                  key={k.value}
                  className="flex items-center gap-2 border border-foreground/10 rounded-md px-3 py-2 cursor-pointer hover:border-foreground/30 transition-colors"
                >
                  <RadioGroupItem value={k.value} />
                  <span className="text-sm">{k.label}</span>
                </label>
              ))}
            </RadioGroup>
            {errors.kycLevel && (
              <p className="text-xs text-destructive-foreground">
                {errors.kycLevel.message}
              </p>
            )}
          </div>

          {/* AML Score */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <Label>AML Score</Label>
              <span className="font-mono text-sm text-muted-foreground">
                {amlScore}
              </span>
            </div>
            <Slider
              min={0}
              max={100}
              step={1}
              value={[amlScore]}
              onValueChange={([val]) => setValue('amlScore', val)}
            />
            <div className="flex justify-between text-xs text-muted-foreground font-mono">
              <span>Low risk</span>
              <span>High risk</span>
            </div>
          </div>

          {/* Credential Expiry */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="expiresAt">Credential Expiry</Label>
            <Input
              id="expiresAt"
              type="date"
              {...register('expiresAt')}
              aria-invalid={!!errors.expiresAt}
            />
            {errors.expiresAt && (
              <p className="text-xs text-destructive-foreground">
                {errors.expiresAt.message}
              </p>
            )}
          </div>

          {/* Error */}
          {submitError && (
            <div className="p-3 border border-destructive/20 bg-destructive/5 text-sm text-destructive-foreground">
              {submitError}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={submitting || !publicKey}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-foreground text-background font-mono text-xs tracking-widest uppercase hover:bg-foreground/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting && (
              <Loader2 className="size-3 animate-spin" />
            )}
            {submitting ? 'Issuing credential...' : 'Register & Issue Credential'}
            {!submitting && <ArrowRight className="size-3" />}
          </button>

          {!publicKey && (
            <p className="text-xs text-muted-foreground text-center">
              Please{' '}
              <a href="/onboard/connect" className="underline">
                connect your wallet
              </a>{' '}
              first.
            </p>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
