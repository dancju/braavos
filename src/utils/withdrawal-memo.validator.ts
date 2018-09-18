import { registerDecorator, ValidationArguments } from 'class-validator';
import { CreateWithdrawalDto } from '../client/create-withdrawal.dto';
import { Withdrawal } from '../entities/withdrawal.entity';
import { CoinSymbol } from './coin-symbol.enum';

export const WithdrawalMemoValidator = () => {
  return (
    object: CreateWithdrawalDto | Withdrawal,
    propertyName: string,
  ): void => {
    registerDecorator({
      name: 'isLongerThan',
      propertyName,
      target: object.constructor,
      validator: {
        validate(value: any, args: ValidationArguments) {
          if (!(object instanceof Withdrawal)) {
            return false;
          }
          return (
            (object.coinSymbol === CoinSymbol.EOS && !!value) ||
            (object.coinSymbol !== CoinSymbol.EOS &&
              typeof value === 'undefined')
          );
        },
      },
    });
  };
};
