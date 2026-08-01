import { execFileSync } from "node:child_process";
import fs from "node:fs";

const rules = [
  ["OpenAI API key", /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/g],
  ["Anthropic API key", /\bsk-ant-[A-Za-z0-9_-]{20,}\b/g],
  ["Stripe live secret", /\b(?:sk_live_|rk_live_|whsec_)[A-Za-z0-9]{16,}\b/g],
  ["GitHub token", /\b(?:github_pat_[A-Za-z0-9_]{20,}|gh[pousr]_[A-Za-z0-9]{20,})\b/g],
  ["AWS access key", /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g],
  ["Google API key", /\bAIza[0-9A-Za-z_-]{30,}\b/g],
  ["Slack token", /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g],
  ["Discord bot token", /\b(?:mfa\.[\w-]{80,}|[MN][A-Za-z\d]{23,}\.[\w-]{6}\.[\w-]{20,})\b/g],
  [
    "Private key",
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]{20,}?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g
  ]
];

const tracked = execFileSync(
  "git",
  ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
  {
  encoding: "utf8",
  maxBuffer: 32 * 1024 * 1024
  }
).split("\0").filter(Boolean);

const findings = [];
let scanned = 0;
for (const file of tracked) {
  let stats;
  try {
    stats = fs.lstatSync(file);
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ENOENT") continue;
    throw error;
  }
  // Never follow a repository symlink and accidentally read data outside the
  // checkout (especially developer credentials from a home directory).
  if (stats.isSymbolicLink()) continue;
  if (!stats.isFile() || stats.size > 5 * 1024 * 1024) continue;
  const content = fs.readFileSync(file, "utf8");
  if (content.includes("\0")) continue;
  scanned += 1;
  for (const [rule, pattern] of rules) {
    pattern.lastIndex = 0;
    for (const match of content.matchAll(pattern)) {
      const line = content.slice(0, match.index).split("\n").length;
      findings.push({ file, line, rule });
    }
  }
}

if (findings.length > 0) {
  console.error("Potential secrets detected (values intentionally hidden):");
  for (const finding of findings) {
    console.error(`- ${finding.file}:${finding.line} [${finding.rule}]`);
  }
  process.exit(1);
}

console.log(`Secret scan passed for ${scanned} repository files.`);
