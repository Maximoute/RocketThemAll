type BotDmResult = {
  ok: boolean;
  error?: string;
};

export async function sendBotDirectMessage(discordUserId: string, content: string): Promise<BotDmResult> {
  const token = process.env.DISCORD_TOKEN;
  if (!token) {
    return { ok: false, error: "DISCORD_TOKEN manquant" };
  }

  try {
    const channelResponse = await fetch("https://discord.com/api/v10/users/@me/channels", {
      method: "POST",
      headers: {
        Authorization: `Bot ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ recipient_id: discordUserId }),
      cache: "no-store"
    });

    if (!channelResponse.ok) {
      return { ok: false, error: `DM channel ${channelResponse.status}` };
    }

    const channel = await channelResponse.json() as { id?: string };
    if (!channel.id) {
      return { ok: false, error: "Salon DM introuvable" };
    }

    const messageResponse = await fetch(`https://discord.com/api/v10/channels/${channel.id}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bot ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ content }),
      cache: "no-store"
    });

    if (!messageResponse.ok) {
      return { ok: false, error: `DM message ${messageResponse.status}` };
    }

    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}