export function captureResultColor(succeeded: boolean, variant?: string | null) {
  if (!succeeded) return 0xe74c3c;
  if (variant?.toLowerCase() === "holo") return 0xffb300;
  if (variant?.toLowerCase() === "shiny") return 0x00d2d3;
  return 0x2ecc71;
}
