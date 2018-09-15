import { ApiModelProperty, ApiModelPropertyOptional } from '@nestjs/swagger';

import { CoinSymbol } from '../utils/coin-symbol.enum';

export class CreateWithdrawalDto {
  @ApiModelProperty({ description: '幂等键' })
  public key: string;

  @ApiModelProperty({ description: '数字货币符号' })
  public coinSymbol: CoinSymbol;

  @ApiModelProperty({ description: '收币地址／账户' })
  public recipient: string;

  @ApiModelPropertyOptional({
    description: '附言，仅针对某些币种有效且是必须的',
  })
  public memo?: string;

  @ApiModelProperty({ description: '数量' })
  public amount: string;
}
