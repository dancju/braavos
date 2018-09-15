import { Test, TestingModule } from '@nestjs/testing';
import { CoinSymbol } from '../utils/coin-symbol.enum';
import { ClientController } from './client.controller';

describe('Client Controller', () => {
  let module: TestingModule;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      controllers: [ClientController],
    }).compile();
  });

  it('should be defined', () => {
    const controller = module.get<ClientController>(ClientController);
    expect(controller).toBeDefined();
  });

  it('should return coins', () => {
    const controller = module.get<ClientController>(ClientController);
    expect(controller.getCoins(CoinSymbol.BTC)).toBe('Hello World!');
  });
});
