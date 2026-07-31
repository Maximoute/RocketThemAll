import { prisma } from "@rta/database";
import {
  announceHallOfFameCapture,
  isHallOfFameVariant
} from "../apps/bot/dist/commands/hall-of-fame.js";

const EXPECTED_PRIMARY_GUILD_ID = "1505371908621729954";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

try {
  assert(isHallOfFameVariant("shiny"), "Une capture Shiny doit être éligible.");
  assert(isHallOfFameVariant("holo"), "Une capture Holo doit être éligible.");
  assert(!isHallOfFameVariant("normal"), "Une capture normale ne doit pas être éligible.");

  const primaryGuilds = await prisma.guild.findMany({
    where: { isPrimary: true },
    include: { config: true }
  });
  assert(primaryGuilds.length === 1, "Il doit exister exactement un serveur principal.");
  const primaryGuild = primaryGuilds[0];
  assert(
    primaryGuild.discordId === EXPECTED_PRIMARY_GUILD_ID,
    `Le serveur principal doit être ${EXPECTED_PRIMARY_GUILD_ID}.`
  );
  assert(
    primaryGuild.name === "Rocket Them All",
    `Le serveur principal synchronisé est "${primaryGuild.name}" au lieu de "Rocket Them All".`
  );

  const configuredGuilds = await prisma.guild.findMany({
    orderBy: [{ isPrimary: "desc" }, { name: "asc" }],
    select: {
      name: true,
      discordId: true,
      isPrimary: true,
      config: {
        select: {
          hallOfFameEnabled: true,
          hallOfFameChannelId: true
        }
      }
    }
  });
  for (const guild of configuredGuilds) {
    assert(
      !guild.config?.hallOfFameEnabled || Boolean(guild.config.hallOfFameChannelId),
      `Le Hall of Fame de ${guild.name} est actif sans salon.`
    );
  }

  const normalResult = await announceHallOfFameCapture({
    client: {},
    sourceGuildId: EXPECTED_PRIMARY_GUILD_ID,
    playerDiscordId: "smoke-player",
    captureAttemptId: "smoke-attempt",
    cardId: "smoke-card",
    variant: "normal"
  });
  assert(
    normalResult.status === "IGNORED_VARIANT",
    "Une capture normale ne doit pas atteindre le Hall of Fame."
  );

  const announcementCount = await prisma.hallOfFameAnnouncement.count();

  console.log(JSON.stringify({
    primaryGuild: {
      name: primaryGuild.name,
      discordId: primaryGuild.discordId,
      isPrimary: primaryGuild.isPrimary
    },
    guildHallOfFameSettings: configuredGuilds.map((guild) => ({
      name: guild.name,
      discordId: guild.discordId,
      enabled: guild.config?.hallOfFameEnabled ?? false,
      channelConfigured: Boolean(guild.config?.hallOfFameChannelId)
    })),
    normalCaptureStatus: normalResult.status,
    eligibleVariants: ["shiny", "holo"],
    announcementRows: announcementCount
  }, null, 2));
} finally {
  await prisma.$disconnect();
}
