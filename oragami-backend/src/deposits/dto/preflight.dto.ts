import { IsString, Matches } from 'class-validator';

export class PreflightDto {
  @IsString()
  @Matches(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/)
  wallet!: string;

  @IsString()
  usdcAmount!: string;
}
