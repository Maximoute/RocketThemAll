import { hostname } from "node:os";
import { randomUUID } from "node:crypto";
import { Prisma, prisma, type ScheduledJobStatus } from "@rta/database";
import {
  AchievementService,
  BossService,
  CollectionContractService,
  DailyQuestService
} from "@rta/services";
import { retryDelayMs } from "./backoff.js";

interface ClaimedJob {
  id: string;
  type: string;
  payload: Prisma.JsonValue;
  attempts: number;
  maxAttempts: number;
}

interface ClaimedEvent {
  id: string;
  eventId: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  payload: Prisma.JsonValue;
  attempts: number;
}

function positiveInteger(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}

const workerId = `${hostname()}:${process.pid}:${randomUUID()}`;
const pollIntervalMs = positiveInteger("WORKER_POLL_INTERVAL_MS", 1_000);
const leaseMs = positiveInteger("WORKER_LEASE_MS", 60_000);
const outboxMaxAttempts = positiveInteger("OUTBOX_MAX_ATTEMPTS", 8);
const bossService = new BossService();
const dailyQuestService = new DailyQuestService();
const achievementService = new AchievementService();
const collectionContractService = new CollectionContractService();
let stopping = false;

function log(level: "info" | "warn" | "error", message: string, context = {}) {
  const entry = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    service: "worker",
    workerId,
    message,
    ...context
  });
  if (level === "error") console.error(entry);
  else if (level === "warn") console.warn(entry);
  else console.info(entry);
}

async function claimJob(): Promise<ClaimedJob | null> {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<ClaimedJob[]>(Prisma.sql`
      WITH candidate AS (
        SELECT "id"
        FROM "ScheduledJob"
        WHERE "status" = 'PENDING'::"ScheduledJobStatus"
          AND "runAt" <= CURRENT_TIMESTAMP
          AND "attempts" < "maxAttempts"
        ORDER BY "runAt", "createdAt"
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      UPDATE "ScheduledJob" AS job
      SET "status" = 'RUNNING'::"ScheduledJobStatus",
          "lockedAt" = CURRENT_TIMESTAMP,
          "lockedBy" = ${workerId},
          "attempts" = job."attempts" + 1,
          "updatedAt" = CURRENT_TIMESTAMP
      FROM candidate
      WHERE job."id" = candidate."id"
      RETURNING job."id", job."type", job."payload", job."attempts", job."maxAttempts"
    `);
    return rows[0] ?? null;
  });
}

async function claimOutboxEvent(): Promise<ClaimedEvent | null> {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<ClaimedEvent[]>(Prisma.sql`
      WITH candidate AS (
        SELECT "id"
        FROM "OutboxEvent"
        WHERE "status" = 'PENDING'::"DeliveryStatus"
          AND "availableAt" <= CURRENT_TIMESTAMP
          AND "attempts" < ${outboxMaxAttempts}
        ORDER BY "availableAt", "createdAt"
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      UPDATE "OutboxEvent" AS event
      SET "status" = 'PROCESSING'::"DeliveryStatus",
          "lockedAt" = CURRENT_TIMESTAMP,
          "lockedBy" = ${workerId},
          "attempts" = event."attempts" + 1
      FROM candidate
      WHERE event."id" = candidate."id"
      RETURNING event."id", event."eventId", event."eventType",
                event."aggregateType", event."aggregateId", event."payload", event."attempts"
    `);
    return rows[0] ?? null;
  });
}

function payloadId(payload: Prisma.JsonValue, key: string): string {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error(`Job payload must be an object containing ${key}`);
  }
  const value = payload[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Job payload field ${key} must be a non-empty string`);
  }
  return value;
}

async function processJob(job: ClaimedJob): Promise<void> {
  if (job.type === "trade.expire") {
    const tradeId = payloadId(job.payload, "tradeId");
    await prisma.trade.updateMany({
      where: { id: tradeId, status: "pending", expiresAt: { lte: new Date() } },
      data: { status: "expired", version: { increment: 1 } }
    });
    return;
  }
  if (job.type === "encounter.expire") {
    const encounterId = payloadId(job.payload, "encounterId");
    await prisma.encounter.updateMany({
      where: {
        id: encounterId,
        status: { in: ["SCHEDULED", "ACTIVE"] },
        closesAt: { lte: new Date() }
      },
      data: { status: "EXPIRED", resolvedAt: new Date(), version: { increment: 1 } }
    });
    return;
  }
  if (job.type === "quest.expire") {
    const dayKey = payloadId(job.payload, "dayKey");
    await prisma.userDailyQuest.updateMany({
      where: {
        dayKey,
        status: { in: ["ACTIVE", "COMPLETED"] },
        expiresAt: { lte: new Date() }
      },
      data: { status: "EXPIRED", version: { increment: 1 } }
    });
    return;
  }
  if (job.type === "quest.rotate") {
    await dailyQuestService.rotateDailyQuests();
    return;
  }
  if (job.type === "boss.activate") {
    const bossRunId = payloadId(job.payload, "bossRunId");
    await bossService.activateRun(bossRunId);
    return;
  }
  if (job.type === "boss.expire") {
    const bossRunId = payloadId(job.payload, "bossRunId");
    await bossService.expireRun(bossRunId);
    return;
  }
  if (job.type === "collection_contract.expire") {
    const contractId = payloadId(job.payload, "contractId");
    await collectionContractService.expireContract(contractId);
    return;
  }
  throw new Error(`Unsupported scheduled job type: ${job.type}`);
}

async function completeJob(jobId: string): Promise<void> {
  await prisma.scheduledJob.updateMany({
    where: { id: jobId, status: "RUNNING", lockedBy: workerId },
    data: {
      status: "SUCCEEDED",
      completedAt: new Date(),
      lockedAt: null,
      lockedBy: null,
      lastError: null
    }
  });
}

async function failJob(job: ClaimedJob, error: unknown): Promise<void> {
  const terminal = job.attempts >= job.maxAttempts;
  const status: ScheduledJobStatus = terminal ? "FAILED" : "PENDING";
  await prisma.scheduledJob.updateMany({
    where: { id: job.id, status: "RUNNING", lockedBy: workerId },
    data: {
      status,
      runAt: terminal ? undefined : new Date(Date.now() + retryDelayMs(job.attempts)),
      lockedAt: null,
      lockedBy: null,
      lastError: error instanceof Error ? error.message.slice(0, 2_000) : "Unknown job error"
    }
  });
  log(terminal ? "error" : "warn", "Scheduled job failed", {
    jobId: job.id,
    type: job.type,
    attempt: job.attempts,
    terminal
  });
}

async function publishEvent(event: ClaimedEvent): Promise<void> {
  if (event.eventType === "capture.succeeded") {
    await bossService.recordCaptureAttempt(event.aggregateId);
  }
  await dailyQuestService.processDomainEvent({
    eventId: event.eventId,
    eventType: event.eventType,
    aggregateId: event.aggregateId,
    payload: event.payload
  });
  await achievementService.processDomainEvent({
    eventId: event.eventId,
    eventType: event.eventType,
    aggregateId: event.aggregateId,
    payload: event.payload
  });
  // The durable row is retained after publication. Broker/Discord adapters can be
  // added here without changing the domain transaction that created the event.
  log("info", "Domain event published", {
    eventId: event.eventId,
    eventType: event.eventType,
    aggregateType: event.aggregateType,
    aggregateId: event.aggregateId
  });
}

async function completeEvent(eventId: string): Promise<void> {
  await prisma.outboxEvent.updateMany({
    where: { id: eventId, status: "PROCESSING", lockedBy: workerId },
    data: {
      status: "PUBLISHED",
      publishedAt: new Date(),
      lockedAt: null,
      lockedBy: null,
      lastError: null
    }
  });
}

async function failEvent(event: ClaimedEvent, error: unknown): Promise<void> {
  const terminal = event.attempts >= outboxMaxAttempts;
  await prisma.outboxEvent.updateMany({
    where: { id: event.id, status: "PROCESSING", lockedBy: workerId },
    data: {
      status: terminal ? "FAILED" : "PENDING",
      availableAt: new Date(Date.now() + retryDelayMs(event.attempts)),
      lockedAt: null,
      lockedBy: null,
      lastError: error instanceof Error ? error.message.slice(0, 2_000) : "Unknown event error"
    }
  });
}

async function recoverStaleLeases(): Promise<void> {
  const staleBefore = new Date(Date.now() - leaseMs);
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`
      UPDATE "ScheduledJob"
      SET "status" = CASE
            WHEN "attempts" >= "maxAttempts" THEN 'FAILED'::"ScheduledJobStatus"
            ELSE 'PENDING'::"ScheduledJobStatus"
          END,
          "lockedAt" = NULL,
          "lockedBy" = NULL,
          "updatedAt" = CURRENT_TIMESTAMP
      WHERE "status" = 'RUNNING'::"ScheduledJobStatus"
        AND "lockedAt" < ${staleBefore}
    `);
    await tx.outboxEvent.updateMany({
      where: {
        status: "PROCESSING",
        lockedAt: { lt: staleBefore },
        attempts: { lt: outboxMaxAttempts }
      },
      data: { status: "PENDING", lockedAt: null, lockedBy: null }
    });
    await tx.outboxEvent.updateMany({
      where: {
        status: "PROCESSING",
        lockedAt: { lt: staleBefore },
        attempts: { gte: outboxMaxAttempts }
      },
      data: { status: "FAILED", lockedAt: null, lockedBy: null }
    });
  });
}

async function workOnce(): Promise<boolean> {
  const job = await claimJob();
  if (job) {
    try {
      await processJob(job);
      await completeJob(job.id);
    } catch (error) {
      await failJob(job, error);
    }
    return true;
  }

  const event = await claimOutboxEvent();
  if (event) {
    try {
      await publishEvent(event);
      await completeEvent(event.id);
    } catch (error) {
      await failEvent(event, error);
    }
    return true;
  }
  return false;
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function main(): Promise<void> {
  log("info", "Worker starting", { pollIntervalMs, leaseMs });
  await recoverStaleLeases();
  await bossService.reconcileProgressionBosses();
  await bossService.reconcileDailyBosses();
  await dailyQuestService.rotateDailyQuests();
  let lastLeaseRecovery = Date.now();
  let lastBossReconciliation = Date.now();
  let lastQuestReconciliation = Date.now();

  while (!stopping) {
    const worked = await workOnce();
    if (Date.now() - lastLeaseRecovery >= leaseMs) {
      await recoverStaleLeases();
      lastLeaseRecovery = Date.now();
    }
    if (Date.now() - lastBossReconciliation >= 60_000) {
      try {
        await bossService.reconcileProgressionBosses();
        await bossService.reconcileDailyBosses();
      } catch (error) {
        log("error", "Daily boss reconciliation failed", {
          message: error instanceof Error ? error.message : String(error)
        });
      }
      lastBossReconciliation = Date.now();
    }
    if (Date.now() - lastQuestReconciliation >= 60_000) {
      try {
        await dailyQuestService.rotateDailyQuests();
      } catch (error) {
        log("error", "Daily quest reconciliation failed", {
          message: error instanceof Error ? error.message : String(error)
        });
      }
      lastQuestReconciliation = Date.now();
    }
    if (!worked) await wait(pollIntervalMs);
  }

  await prisma.$disconnect();
  log("info", "Worker stopped");
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    stopping = true;
    log("info", "Worker shutdown requested", { signal });
  });
}

main().catch(async (error) => {
  log("error", "Worker stopped unexpectedly", {
    message: error instanceof Error ? error.message : String(error)
  });
  await prisma.$disconnect();
  process.exitCode = 1;
});
