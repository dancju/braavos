import { Test, TestingModule } from '@nestjs/testing';
import { DashboardController } from './dashboard.controller';

describe('Dashboard Controller', () => {
  let module: TestingModule;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      controllers: [DashboardController],
    }).compile();
  });

  it('should be defined', () => {
    const controller = module.get<DashboardController>(DashboardController);
    expect(controller).toBeDefined();
  });
});
