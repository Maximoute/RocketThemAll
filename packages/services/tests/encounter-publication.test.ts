import { describe, expect, it } from "vitest";
import { encounterPublicationState } from "../src/explore.service.js";

const privateEncounter = {
  initiatorUserId: "initiator",
  messageId: null,
  publishedAt: null,
  publishAfter: null
};

describe("encounter publication state", () => {
  it("schedules only the initiator's private encounter", () => {
    expect(encounterPublicationState(privateEncounter, "initiator")).toEqual({
      phase: "PRIVATE",
      publishAfter: null,
      shouldSchedule: true
    });
    expect(encounterPublicationState(privateEncounter, "other-player")).toEqual({
      phase: "PRIVATE",
      publishAfter: null,
      shouldSchedule: false
    });
  });

  it("does not reschedule an encounter that is already queued", () => {
    const publishAfter = new Date("2099-01-01T00:01:00.000Z");
    expect(encounterPublicationState({
      ...privateEncounter,
      publishAfter
    }, "initiator")).toEqual({
      phase: "SCHEDULED",
      publishAfter,
      shouldSchedule: false
    });
  });

  it("never republishes an encounter that is already public", () => {
    expect(encounterPublicationState({
      ...privateEncounter,
      messageId: "discord-message-id"
    }, "other-player")).toEqual({
      phase: "PUBLIC",
      publishAfter: null,
      shouldSchedule: false
    });
    expect(encounterPublicationState({
      ...privateEncounter,
      publishedAt: new Date("2099-01-01T00:00:00.000Z")
    }, "initiator")).toEqual({
      phase: "PUBLIC",
      publishAfter: null,
      shouldSchedule: false
    });
  });
});
