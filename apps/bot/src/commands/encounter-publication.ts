const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Discord limits message nonces to 25 characters. Encoding the UUID as one
 * base-36 integer keeps the full 128 bits (and therefore uniqueness) in at
 * most 25 characters.
 */
export function encounterPublicationNonce(encounterId: string) {
  if (!UUID.test(encounterId)) {
    throw new Error("Encounter publication requires a valid UUID.");
  }

  const compact = encounterId.replaceAll("-", "");
  return BigInt(`0x${compact}`).toString(36);
}
