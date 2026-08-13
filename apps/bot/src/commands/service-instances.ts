import {
  BoosterService,
  InventoryService,
  TradeService,
  UsersService,
  CardsService,
  ConfigService,
  EconomyService,
  SellService,
  RecycleService,
  FusionService,
  DailyService,
  ExploreService,
  ItemShopService,
  WeeklyCardShopService,
  SkillService,
  EquipmentService,
  BossService,
  DailyQuestService,
  ExplorationEnergyService,
  AchievementService,
  DiscordAchievementRoleService,
  DiscordLevelRoleService,
  ArchiveService,
  CollectionContractService,
  ConquerorRewardService,
  MonetizationService,
  renderQuestName,
  AppError
} from "@rta/services";
import { prisma } from "@rta/database";
import { ADMIN_ROLE_ID } from "@rta/auth";

export const inventoryService = new InventoryService();
export const boosterService = new BoosterService();
export const tradeService = new TradeService();
export const usersService = new UsersService();
export const cardsService = new CardsService();
export const configService = new ConfigService();
export const economyService = new EconomyService();
export const sellService = new SellService();
export const recycleService = new RecycleService();
export const fusionService = new FusionService();
export const dailyService = new DailyService();
export const exploreService = new ExploreService();
export const itemShopService = new ItemShopService();
export const weeklyCardShopService = new WeeklyCardShopService();
export const skillService = new SkillService();
export const equipmentService = new EquipmentService();
export const bossService = new BossService();
export const dailyQuestService = new DailyQuestService();
export const explorationEnergyService = new ExplorationEnergyService();
export const achievementService = new AchievementService();
export const discordAchievementRoleService = new DiscordAchievementRoleService();
export const discordLevelRoleService = new DiscordLevelRoleService();
export const archiveService = new ArchiveService();
export const conquerorRewardService = new ConquerorRewardService();
export const collectionContractService = new CollectionContractService();
export const monetizationService = new MonetizationService();

export const inventoryCache = new Map<
  string,
  Array<{
    id: string;
    cardId: string;
    variant: string;
    card: any;
    quantity: number;
  }>
>();

export { AppError, prisma, renderQuestName };
