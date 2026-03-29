import {
  IsIn,
  IsInt,
  IsString,
  MaxLength,
  Min,
  Max,
  Matches,
} from 'class-validator';

export class IssueCredentialDto {
  @IsString()
  @Matches(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/, {
    message: 'wallet must be a valid base58 Solana public key',
  })
  wallet!: string;

  @IsString()
  @MaxLength(64)
  institutionName!: string;

  /** ISO 3166-1 alpha-2 (e.g. CH) or up to 4 chars for fixed encoding */
  @IsString()
  @MaxLength(4)
  jurisdiction!: string;

  @IsIn([1, 2, 3])
  tier!: 1 | 2 | 3;

  @IsIn([1, 2, 3])
  kycLevel!: 1 | 2 | 3;

  @IsInt()
  @Min(0)
  @Max(100)
  amlScore!: number;

  @IsString()
  expiresAt!: string; // ISO 8601
}
