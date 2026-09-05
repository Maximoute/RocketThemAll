export const RTA_DEVELOPMENT_ENVIRONMENT = "development";
export const RTA_DEVELOPMENT_SESSION_COOKIE = "__Secure-rta-dev.session-token";

export function isPrivateDevelopmentEnvironment(
  environment = process.env.RTA_ENVIRONMENT,
) {
  return environment?.trim().toLowerCase() === RTA_DEVELOPMENT_ENVIRONMENT;
}

export function developmentSessionCookieName(
  environment = process.env.RTA_ENVIRONMENT,
) {
  return isPrivateDevelopmentEnvironment(environment)
    ? RTA_DEVELOPMENT_SESSION_COOKIE
    : undefined;
}
