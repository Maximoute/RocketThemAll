import assert from "node:assert/strict";
import { prisma } from "@rta/database";
import { ExploreService } from "@rta/services";

const service = new ExploreService();
const runKey = `smoke-${Date.now()}`;
const users = [];
const encounters = [];

async function createUser(suffix, credits = 0) {
  const user = await prisma.user.create({
    data: {
      discordId: `${runKey}-${suffix}`,
      username: `${runKey}-${suffix}`,
      credits
    }
  });
  users.push(user.id);
  return user;
}

async function grantItem(userId, contentKey, quantity) {
  const item = await prisma.itemDefinition.findUniqueOrThrow({
    where: { contentKey }
  });
  await prisma.userItem.create({
    data: { userId, itemId: item.id, quantity }
  });
}

async function cleanup(guildId) {
  const attempts = encounters.length
    ? await prisma.captureAttempt.findMany({
        where: { encounterId: { in: encounters } },
        select: { id: true }
      })
    : [];
  const attemptIds = attempts.map((attempt) => attempt.id);

  if (attemptIds.length) {
    await prisma.outboxEvent.deleteMany({
      where: { aggregateType: "CaptureAttempt", aggregateId: { in: attemptIds } }
    });
  }
  if (encounters.length) {
    await prisma.scheduledJob.deleteMany({
      where: { dedupeKey: { in: encounters.map((id) => `encounter.expire:${id}`) } }
    });
  }
  await prisma.actionCooldown.deleteMany({
    where: {
      OR: [
        { userId: { in: users } },
        ...(guildId ? [{ guildId }] : [])
      ]
    }
  });
  await prisma.economicLedgerEntry.deleteMany({
    where: {
      OR: [
        { userId: { in: users } },
        ...(guildId ? [{ guildId }] : [])
      ]
    }
  });
  await prisma.transactionLog.deleteMany({ where: { userId: { in: users } } });
  await prisma.economyLog.deleteMany({ where: { userId: { in: users } } });
  await prisma.captureLog.deleteMany({ where: { userId: { in: users } } });
  await prisma.inventoryItem.deleteMany({ where: { userId: { in: users } } });
  if (encounters.length) {
    await prisma.encounter.deleteMany({ where: { id: { in: encounters } } });
  }
  if (guildId) {
    await prisma.guild.deleteMany({ where: { id: guildId } });
  }
  await prisma.user.deleteMany({ where: { id: { in: users } } });
}

let guildId;
try {
  const world = await prisma.worldDefinition.findUniqueOrThrow({
    where: { position: 1 },
    include: {
      zones: {
        where: { status: "PUBLISHED" },
        include: {
          decks: {
            include: { deck: true },
            orderBy: { weight: "desc" }
          }
        },
        orderBy: { position: "asc" }
      }
    }
  });
  const freeZones = world.zones.filter((zone) => zone.access === "FREE");
  const premiumZone = world.zones.find((zone) => zone.access === "PREMIUM");
  assert.ok(freeZones.length >= 2);
  assert.ok(premiumZone);
  const premiumDeck = premiumZone.decks[0]?.deck;
  assert.ok(premiumDeck);

  const guild = await prisma.guild.create({
    data: {
      discordId: `${runKey}-guild`,
      name: runKey,
      config: { create: { premiumEnabled: false } },
      progress: {
        create: {
          frontierWorldId: world.id,
          unlockedWorldCount: 1,
          masteryTarget: 100
        }
      }
    }
  });
  guildId = guild.id;

  const explorer = await createUser("explorer", 100);
  await grantItem(explorer.id, "artifact.spectral_scanner", 1);
  await grantItem(explorer.id, "consumable.common_incense", 1);
  await grantItem(explorer.id, "consumable.precision_catalyst", 1);
  await grantItem(explorer.id, "consumable.expedition_pass", 1);

  const positions = [
    freeZones[0].position,
    freeZones[1].position,
    premiumZone.position
  ];
  const scan = await service.analyzeProposedZone({
    discordGuildId: guild.discordId,
    userId: explorer.id,
    worldPosition: world.position,
    zonePositions: positions,
    analyzeIndex: 0
  });
  assert.equal(scan.zone.position, freeZones[0].position);
  assert.equal(
    scan.bands.standard + scan.bands.rare + scan.bands.exceptional,
    100
  );

  const incense = await service.activateTierIncense({
    userId: explorer.id,
    contentKey: "consumable.common_incense",
    operationKey: `${runKey}:incense`
  });
  assert.equal(incense.remainingUses, 3);

  const creditsBefore = explorer.credits;
  const paidEncounter = await service.createEncounter({
    discordGuildId: guild.discordId,
    userId: explorer.id,
    channelId: `${runKey}-credits`,
    worldPosition: world.position,
    zonePosition: premiumZone.position,
    deckId: premiumDeck.id,
    premiumPayment: "CREDITS",
    operationKey: `${runKey}:premium-credits`
  });
  encounters.push(paidEncounter.encounter.id);

  const afterPaidEntry = await prisma.user.findUniqueOrThrow({
    where: { id: explorer.id }
  });
  assert.equal(
    afterPaidEntry.credits,
    creditsBefore - paidEncounter.zone.metadata.creditCost
  );
  const activeIncense = await prisma.userItemEffect.findUniqueOrThrow({
    where: {
      userId_effectKey: {
        userId: explorer.id,
        effectKey: "EXP_TIER_WEIGHT_BOOST"
      }
    }
  });
  assert.equal(activeIncense.remainingUses, 2);

  await service.prepareCaptureWithCatalyst(paidEncounter.encounter.id, explorer.id);
  const attemptChoices = await service.getAttemptChoices(
    paidEncounter.encounter.id,
    explorer.id
  );
  const countdownMs = attemptChoices.captureClosesAt.getTime() - Date.now();
  assert.ok(countdownMs > 25_000 && countdownMs <= 30_000);
  assert.equal(
    attemptChoices.preparation,
    "consumable.precision_catalyst"
  );
  const explorerAttempt = await service.submitAttempt({
    encounterId: paidEncounter.encounter.id,
    userId: explorer.id,
    selectedCardId: paidEncounter.card.id,
    operationKey: `${runKey}:capture-catalyst`
  });
  assert.equal(explorerAttempt.attempt.preparation, "precision_catalyst");
  const catalyst = await prisma.userItem.findFirstOrThrow({
    where: {
      userId: explorer.id,
      item: { contentKey: "consumable.precision_catalyst" }
    }
  });
  assert.equal(catalyst.quantity, 0);

  let successfulCapture;
  for (let index = 0; index < 20 && !successfulCapture; index += 1) {
    const participant = await createUser(`participant-${index}`, 0);
    await service.getAttemptChoices(paidEncounter.encounter.id, participant.id);
    const result = await service.submitAttempt({
      encounterId: paidEncounter.encounter.id,
      userId: participant.id,
      selectedCardId: paidEncounter.card.id,
      operationKey: `${runKey}:capture-${index}`
    });
    if (result.attempt.status === "SUCCEEDED") {
      const rewardedUser = await prisma.user.findUniqueOrThrow({
        where: { id: participant.id }
      });
      assert.equal(rewardedUser.credits, result.rewards.credits);
      assert.equal(rewardedUser.xp, result.rewards.xp);
      assert.ok(result.rewards.credits > 0);
      assert.ok(result.rewards.xp > 0);
      successfulCapture = result;
    }
  }
  assert.ok(successfulCapture, "Aucune capture réussie après 20 essais corrects.");

  const beforePassEntry = await prisma.user.findUniqueOrThrow({
    where: { id: explorer.id }
  });
  const passEncounter = await service.createEncounter({
    discordGuildId: guild.discordId,
    userId: explorer.id,
    channelId: `${runKey}-pass`,
    worldPosition: world.position,
    zonePosition: premiumZone.position,
    deckId: premiumDeck.id,
    premiumPayment: "PASS",
    operationKey: `${runKey}:premium-pass`
  });
  encounters.push(passEncounter.encounter.id);
  const afterPassEntry = await prisma.user.findUniqueOrThrow({
    where: { id: explorer.id }
  });
  const pass = await prisma.userItem.findFirstOrThrow({
    where: {
      userId: explorer.id,
      item: { contentKey: "consumable.expedition_pass" }
    }
  });
  assert.equal(afterPassEntry.credits, beforePassEntry.credits);
  assert.equal(pass.quantity, 0);

  console.log(JSON.stringify({
    status: "ok",
    countdownSeconds: Math.round(countdownMs / 1000),
    captureRewards: successfulCapture.rewards,
    premiumCreditsDebited:
      creditsBefore - afterPaidEntry.credits,
    premiumPassConsumed: true,
    scannerBands: scan.bands,
    tierIncenseRemainingAfterFirstRun: activeIncense.remainingUses,
    catalystConsumed: true
  }, null, 2));
} finally {
  await cleanup(guildId);
  await prisma.$disconnect();
}
