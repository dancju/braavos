import { ApiModelProperty, ApiModelPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsString } from 'class-validator';
import { CoinSymbol } from '../utils/coin-symbol.enum';

export class CreateWithdrawalDto {
  @ApiModelProperty({ description: '幂等键' })
  // TODO convert number to string
  public key!: string;

  @ApiModelProperty({ description: '数字货币符号' })
  @IsEnum(CoinSymbol)
  public coinSymbol!: CoinSymbol;

  @ApiModelProperty({ description: '收币地址／账户' })
  @IsString()
  public recipient!: string;

  @ApiModelPropertyOptional({
    description: '附言，仅针对 EOS 有效且是必须的',
  })
  public memo?: string;

  @ApiModelProperty({ description: '数量' })
  // TODO convert number to string
  public amount!: string;
}
