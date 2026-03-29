import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Oragami — Institutional RWA Vault',
  description: 'Deposit USDC, mint cVAULT backed by Gold + CHF + Solstice USX yield. KYC/AML compliance enforced on-chain via Solana Token-2022 transfer hooks.',
  keywords: ['Solana', 'RWA', 'DeFi', 'Institutional', 'Compliance', 'Vault', 'cVAULT', 'Solstice', 'SIX'],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased">{children}</body>
    </html>
  );
}
