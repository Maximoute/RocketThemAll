"use client";

import { useEffect, useMemo, useState } from "react";

type DiscordAvatarProps = {
  avatarUrl?: string | null;
  discordId?: string | null;
  username: string;
  size?: number;
};

const DISCORD_IMAGE_HOSTS = new Set(["cdn.discordapp.com", "media.discordapp.net"]);

function trustedDiscordAvatar(avatarUrl: string | null | undefined, discordId?: string | null) {
  if (!avatarUrl) return null;
  try {
    const parsed = new URL(avatarUrl);
    if (parsed.protocol !== "https:" || !DISCORD_IMAGE_HOSTS.has(parsed.hostname)) return null;
    if (discordId) {
      const custom = parsed.pathname.startsWith(`/avatars/${discordId}/`);
      const member = parsed.pathname.includes(`/guilds/`) && parsed.pathname.includes(`/users/${discordId}/`);
      if (!custom && !member) return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

function defaultDiscordAvatar(discordId?: string | null) {
  try {
    const index = discordId ? Number((BigInt(discordId) >> 22n) % 6n) : 0;
    return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
  } catch {
    return "https://cdn.discordapp.com/embed/avatars/0.png";
  }
}

export default function DiscordAvatar({
  avatarUrl,
  discordId,
  username,
  size = 64
}: DiscordAvatarProps) {
  const customAvatar = useMemo(
    () => trustedDiscordAvatar(avatarUrl, discordId),
    [avatarUrl, discordId]
  );
  const fallbackAvatar = useMemo(() => defaultDiscordAvatar(discordId), [discordId]);
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [customAvatar]);
  const source = customAvatar && !failed ? customAvatar : fallbackAvatar;

  return (
    // Browser-only Discord CDN request; no server-side image proxy is used.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={source}
      alt={`Photo de profil Discord de ${username}`}
      width={size}
      height={size}
      className="h-full w-full object-cover"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}

