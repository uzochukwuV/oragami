import { IsOptional, IsString, Matches, MinLength } from 'class-validator';

export class IndexDepositDto {
  @IsString()
  @MinLength(32)
  txSignature!: string;

  @IsString()
  @Matches(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/)
  wallet!: string;

  @IsString()
  usdcAmount!: string;

  @IsString()
  cvaultAmount!: string;

  /** Idempotency / travel-rule nonce hash (hex) or client reference */
  @IsString()
  nonce!: string;

  @IsOptional()
  @IsString()
  travelRuleNonceHash?: string;
}
