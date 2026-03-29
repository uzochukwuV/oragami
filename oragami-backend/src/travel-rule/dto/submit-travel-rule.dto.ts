import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class SubmitTravelRuleDto {
  @IsString()
  @Matches(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/)
  wallet!: string;

  /** USDC amount in smallest units (6 decimals), as string bigint */
  @IsString()
  @MinLength(1)
  usdcAmount!: string;

  @IsString()
  @MaxLength(64)
  originatorName!: string;

  @IsString()
  @MaxLength(34)
  originatorAccount!: string;

  @IsString()
  @MaxLength(64)
  beneficiaryName!: string;
}
