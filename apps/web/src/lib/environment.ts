export function isRtaDevelopmentRequest(
  _host: string | null | undefined,
  environment = process.env.RTA_ENVIRONMENT,
) {
  return environment?.trim().toLowerCase() === "sandbox";
}
