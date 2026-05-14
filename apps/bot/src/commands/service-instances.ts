import {
  BoosterService,
  CaptureService,
  InventoryService,
  TradeService,
  UsersService,
  CardsService,
  ConfigService,
  SpawnService,
  SpawnEnergyService,
  EconomyService,
  SellService,
  RecycleService,
  FusionService,
  DailyService,
  AppError
} from "@rta/services";
import { prisma } from "@rta/database";
import { ADMIN_ROLE_ID } from "@rta/auth";

export const captureService = new CaptureService();
export const inventoryService = new InventoryService();
export const boosterService = new BoosterService();
export const tradeService = new TradeService();
export const usersService = new UsersService();
export const cardsService = new CardsService();
export const configService = new ConfigService();
export const spawnService = new SpawnService();
export const spawnEnergyService = new SpawnEnergyService();
export const economyService = new EconomyService();
export const sellService = new SellService();
export const recycleService = new RecycleService();
export const fusionService = new FusionService();
export const dailyService = new DailyService();

export const inventoryCache = new Map<string, Array<{ card: any; quantity: number }>>();

export { AppError, prisma };
