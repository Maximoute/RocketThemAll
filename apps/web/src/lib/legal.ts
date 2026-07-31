export const LEGAL_LAST_UPDATED = "30 juillet 2026";
export const LEGAL_VERSION = "1.0";

type RequiredLegalValue = {
  value: string;
  configured: boolean;
  label: string;
};

function requiredLegalValue(name: string, label: string): RequiredLegalValue {
  const value = process.env[name]?.trim();
  return {
    value: value || `[À renseigner : ${label}]`,
    configured: Boolean(value),
    label
  };
}
function optionalLegalValue(name: string, fallback: string) {
  return process.env[name]?.trim() || fallback;
}

export function getLegalIdentity() {
  const publisherName = requiredLegalValue(
    "LEGAL_PUBLISHER_NAME",
    "nom légal de l’éditeur"
  );
  const publisherStatus = requiredLegalValue(
    "LEGAL_PUBLISHER_STATUS",
    "forme juridique ou qualité d’indépendant"
  );
  const publisherAddress = requiredLegalValue(
    "LEGAL_PUBLISHER_ADDRESS",
    "adresse géographique de l’établissement"
  );
  const publisherEmail = requiredLegalValue(
    "LEGAL_PUBLISHER_EMAIL",
    "adresse e-mail de contact"
  );
  const publisherPhone = requiredLegalValue(
    "LEGAL_PUBLISHER_PHONE",
    "numéro de téléphone"
  );
  const enterpriseNumber = requiredLegalValue(
    "LEGAL_ENTERPRISE_NUMBER",
    "numéro d’entreprise BCE"
  );
  const vatNumber = requiredLegalValue(
    "LEGAL_VAT_NUMBER",
    "numéro de TVA ou mention de non-assujettissement"
  );
  const publicationDirector = requiredLegalValue(
    "LEGAL_PUBLICATION_DIRECTOR",
    "responsable de la publication"
  );
  const hostName = requiredLegalValue(
    "LEGAL_HOST_NAME",
    "nom de l’hébergeur"
  );
  const hostAddress = requiredLegalValue(
    "LEGAL_HOST_ADDRESS",
    "adresse de l’hébergeur"
  );
  const hostWebsite = requiredLegalValue(
    "LEGAL_HOST_WEBSITE",
    "site de l’hébergeur"
  );
  const dataControllerName = optionalLegalValue(
    "LEGAL_DATA_CONTROLLER_NAME",
    publisherName.value
  );
  const privacyEmail = optionalLegalValue(
    "LEGAL_PRIVACY_EMAIL",
    publisherEmail.value
  );

  const required = [
    publisherName,
    publisherStatus,
    publisherAddress,
    publisherEmail,
    publisherPhone,
    enterpriseNumber,
    vatNumber,
    publicationDirector,
    hostName,
    hostAddress,
    hostWebsite
  ];

  return {
    publisherName: publisherName.value,
    publisherStatus: publisherStatus.value,
    publisherAddress: publisherAddress.value,
    publisherEmail: publisherEmail.value,
    publisherPhone: publisherPhone.value,
    enterpriseNumber: enterpriseNumber.value,
    vatNumber: vatNumber.value,
    publicationDirector: publicationDirector.value,
    hostName: hostName.value,
    hostAddress: hostAddress.value,
    hostWebsite: hostWebsite.value,
    dataControllerName,
    privacyEmail,
    missing: required
      .filter((entry) => !entry.configured)
      .map((entry) => entry.label)
  };
}

export function publicEmailHref(email: string, subject: string) {
  return email.startsWith("[À renseigner")
    ? null
    : `mailto:${email}?subject=${encodeURIComponent(subject)}`;
}
