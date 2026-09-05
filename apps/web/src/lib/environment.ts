export const RTA_DEVELOPMENT_HOST = "dev.rocketthemall.com";

export function normalizedHostname(host: string | null | undefined) {
  return (host ?? "").trim().toLowerCase().split(":", 1)[0];
}

export function isRtaDevelopmentRequest(
  host: string | null | undefined,
  environment = process.env.RTA_ENVIRONMENT,
) {
  return (
    normalizedHostname(host) === RTA_DEVELOPMENT_HOST ||
    environment?.trim().toLowerCase() === "development"
  );
}
