"use client";

import { useMemo, useState } from "react";

type DiscordAvatarProps = {
  avatarUrl?: string | null;
  discordId: string;
  username: string;
};

const DISCORD_IMAGE_HOSTS = new Set(["cdn.discordapp.com", "media.discordapp.net"]);

function trustedCustomAvatar(avatarUrl: string | null | undefined, discordId: string) {
  if (!avatarUrl) return null;

  try {
    const parsed = new URL(avatarUrl);
    const expectedPrefix = `/avatars/${discordId}/`;
    if (
      parsed.protocol !== "https:" ||
      !DISCORD_IMAGE_HOSTS.has(parsed.hostname) ||
      !parsed.pathname.startsWith(expectedPrefix)
    ) {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

function defaultDiscordAvatar(discordId: string) {
  try {
    const index = Number((BigInt(discordId) >> 22n) % 6n);
    return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
  } catch {
    return "https://cdn.discordapp.com/embed/avatars/0.png";
  }
}

export default function DiscordAvatar({ avatarUrl, discordId, username }: DiscordAvatarProps) {
  const customAvatar = useMemo(
    () => trustedCustomAvatar(avatarUrl, discordId),
    [avatarUrl, discordId]
  );
  const fallbackAvatar = useMemo(() => defaultDiscordAvatar(discordId), [discordId]);
  const [customAvatarFailed, setCustomAvatarFailed] = useState(false);
  const source = customAvatar && !customAvatarFailed ? customAvatar : fallbackAvatar;

  return (
    // The Next image optimizer deliberately rejects remote URLs to avoid SSRF.
    // This browser request is constrained to Discord's CDN by both the validator
    // above and the site's Content-Security-Policy.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={source}
      alt={`Photo de profil Discord de ${username}`}
      width={64}
      height={64}
      className="h-full w-full object-cover"
      referrerPolicy="no-referrer"
      onError={() => {
        if (customAvatar) setCustomAvatarFailed(true);
      }}
    />
  );
}
