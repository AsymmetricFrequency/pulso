/**
 * Cliente de Discord para el panel administrativo.
 *
 * Discord es la fuente de verdad de la identidad y de los roles del equipo que construye Pulso.
 * Pulso no tiene tabla de usuarios propia para eso: quitarle un rol a alguien en Discord se lo quita
 * en el panel, sin que nadie tenga que acordarse de dar de baja en dos sitios.
 *
 * Esto es **solo** para el equipo de desarrollo. La identidad operacional de brigadistas y
 * coordinadores en campo (passkeys, credenciales profesionales, roles de incidente) es otra cosa y
 * vive en `mission-access-repositories.ts`. Son dos poblaciones distintas y no se cruzan.
 */

const API = "https://discord.com/api/v10";

export class DiscordNotConfiguredError extends Error {
  constructor() {
    super("El panel administrativo necesita las credenciales de Discord");
    this.name = "DiscordNotConfiguredError";
  }
}

export class DiscordAccessDeniedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DiscordAccessDeniedError";
  }
}

export type DiscordConfig = {
  clientId: string;
  clientSecret: string;
  guildId: string;
  botToken: string;
  redirectUri: string;
  /** Canal de foro donde se publican los tickets. Opcional: sin él, publicar simplemente no se ofrece. */
  tasksChannelId?: string | undefined;
  /** Webhook de #alertas. Opcional por la misma razón. */
  alertsWebhookUrl?: string | undefined;
};

export type DiscordRole = {
  id: string;
  name: string;
  color: number;
  position: number;
};

export type DiscordMember = {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  roleIds: string[];
  /** Nombres de rol en minúscula, que es el vocabulario que usa el resto del proyecto. */
  roles: string[];
  joinedAt: string | null;
  bot: boolean;
};

/**
 * Roles que pueden entrar al panel, y qué puede hacer cada uno.
 *
 * Solo `Maintainer` escribe. El resto entra a mirar — y eso ya es la mitad del valor, porque hoy
 * saber cuántos rescates hay abiertos exige un `psql`. La escritura tiene otro nivel de riesgo:
 * asignar roles de Discord desde aquí es, en la práctica, repartir permisos de producción.
 */
export const ADMIN_ROLE = "maintainer";
export const READ_ROLES = [
  "maintainer",
  "core contributor",
  "frontend",
  "backend",
  "data",
  "gis",
  "devops",
  "ai",
  "blockchain",
  "contributor",
];

export const canWrite = (roles: string[]) => roles.includes(ADMIN_ROLE);
export const canRead = (roles: string[]) => roles.some((role) => READ_ROLES.includes(role));

const avatar = (userId: string, hash: string | null | undefined) =>
  hash ? `https://cdn.discordapp.com/avatars/${userId}/${hash}.png?size=64` : null;

export class DiscordClient {
  constructor(private readonly config: DiscordConfig) {}

  /** A dónde se manda al navegador para empezar. `identify` y nada más: no pedimos correo. */
  authorizeUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      response_type: "code",
      scope: "identify",
      state,
      prompt: "none",
    });
    return `${API}/oauth2/authorize?${params.toString()}`;
  }

  async #request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(`${API}${path}`, {
      ...init,
      headers: {
        Authorization: `Bot ${this.config.botToken}`,
        "Content-Type": "application/json",
        // Discord exige un User-Agent propio en su API REST y responde 403 sin explicar nada
        // cuando no lo encuentra. El que ponen los clientes HTTP por defecto está bloqueado.
        "User-Agent": "DiscordBot (https://pulso.my, 0.1)",
        ...init.headers,
      },
    });
    if (!response.ok) {
      const body = await response.text();
      // Listar miembros exige el Server Members Intent, que se activa en el portal y no en el
      // código. Discord solo devuelve un 403 pelado, así que el mensaje se escribe aquí — es la
      // diferencia entre un clic y una tarde de búsqueda.
      if (response.status === 403 && path.includes("/members?")) {
        throw new Error(
          "Discord no deja listar los miembros: falta activar SERVER MEMBERS INTENT en " +
            "Developer Portal → Bot → Privileged Gateway Intents.",
        );
      }
      throw new Error(`Discord ${init.method ?? "GET"} ${path} -> ${response.status}: ${body}`);
    }
    return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
  }

  /** Canjea el código por la identidad de quien entró. El token de usuario no se guarda: se usa una
   *  vez para saber quién es y se descarta — los roles los leemos con el bot, que es más fiable. */
  async exchangeCode(
    code: string,
  ): Promise<{ id: string; username: string; avatar: string | null }> {
    const response = await fetch(`${API}/oauth2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        grant_type: "authorization_code",
        code,
        redirect_uri: this.config.redirectUri,
      }),
    });
    if (!response.ok) {
      throw new DiscordAccessDeniedError("Discord rechazó el código de autorización");
    }
    const { access_token } = (await response.json()) as { access_token: string };

    const me = await fetch(`${API}/users/@me`, {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    if (!me.ok) throw new DiscordAccessDeniedError("No se pudo leer la identidad de Discord");
    return (await me.json()) as { id: string; username: string; avatar: string | null };
  }

  async roles(): Promise<DiscordRole[]> {
    const roles = await this.#request<
      Array<{ id: string; name: string; color: number; position: number }>
    >(`/guilds/${this.config.guildId}/roles`);
    return roles
      .filter((role) => role.name !== "@everyone")
      .sort((a, b) => b.position - a.position)
      .map(({ id, name, color, position }) => ({ id, name, color, position }));
  }

  /** Un miembro concreto. Lanza `DiscordAccessDeniedError` si no está en el servidor — que es
   *  exactamente la comprobación de acceso: no basta con tener cuenta de Discord. */
  async member(userId: string, roleIndex?: Map<string, string>): Promise<DiscordMember> {
    const index = roleIndex ?? (await this.roleIndex());
    let raw: DiscordMemberPayload;
    try {
      raw = await this.#request<DiscordMemberPayload>(
        `/guilds/${this.config.guildId}/members/${userId}`,
      );
    } catch (error) {
      // La causa se conserva. Sin ella, un 403 de configuración y un 404 de «esta persona no está
      // en el servidor» llegan a la pantalla con el mismo texto, y desde fuera son indistinguibles
      // — que es exactamente la situación en la que uno se queda mirando el mismo error una hora.
      throw new DiscordAccessDeniedError(
        `No se pudo leer al miembro ${userId}: ${(error as Error).message}`,
      );
    }
    return toMember(raw, index);
  }

  async members(): Promise<DiscordMember[]> {
    const index = await this.roleIndex();
    const raw = await this.#request<DiscordMemberPayload[]>(
      `/guilds/${this.config.guildId}/members?limit=200`,
    );
    return raw
      .map((member) => toMember(member, index))
      .filter((member) => !member.bot)
      .sort((a, b) => a.displayName.localeCompare(b.displayName, "es"));
  }

  async roleIndex(): Promise<Map<string, string>> {
    return new Map((await this.roles()).map((role) => [role.id, role.name.toLowerCase()]));
  }

  async addRole(userId: string, roleId: string): Promise<void> {
    await this.#request(`/guilds/${this.config.guildId}/members/${userId}/roles/${roleId}`, {
      method: "PUT",
    });
  }

  async removeRole(userId: string, roleId: string): Promise<void> {
    await this.#request(`/guilds/${this.config.guildId}/members/${userId}/roles/${roleId}`, {
      method: "DELETE",
    });
  }

  /** Publica un ticket como hilo en el foro `#tareas`. Devuelve el id del hilo para guardarlo. */
  async publishTaskThread(name: string, body: string): Promise<string | null> {
    if (!this.config.tasksChannelId) return null;
    const thread = await this.#request<{ id: string }>(
      `/channels/${this.config.tasksChannelId}/threads`,
      {
        method: "POST",
        body: JSON.stringify({
          name: name.slice(0, 100),
          message: { content: body.slice(0, 2000) },
        }),
      },
    );
    return thread.id;
  }

  /** Aviso a `#alertas`. Nunca lanza: una alerta que falla no puede tumbar la operación que la
   *  originó — sería la peor forma posible de perder un rescate. */
  async alert(content: string): Promise<void> {
    if (!this.config.alertsWebhookUrl) return;
    try {
      await fetch(this.config.alertsWebhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: content.slice(0, 2000) }),
      });
    } catch {
      // Silencio deliberado. Ver arriba.
    }
  }
}

type DiscordMemberPayload = {
  user?: {
    id: string;
    username: string;
    global_name?: string | null;
    avatar?: string | null;
    bot?: boolean;
  };
  nick?: string | null;
  avatar?: string | null;
  roles: string[];
  joined_at?: string | null;
};

function toMember(raw: DiscordMemberPayload, roleIndex: Map<string, string>): DiscordMember {
  const user = raw.user;
  const userId = user?.id ?? "";
  return {
    userId,
    username: user?.username ?? "desconocido",
    displayName: raw.nick ?? user?.global_name ?? user?.username ?? "desconocido",
    avatarUrl: avatar(userId, raw.avatar ?? user?.avatar),
    roleIds: raw.roles,
    roles: raw.roles.map((id) => roleIndex.get(id)).filter((name): name is string => Boolean(name)),
    joinedAt: raw.joined_at ?? null,
    bot: user?.bot === true,
  };
}

/** Lee la configuración del entorno. Devuelve `null` si falta algo: el panel entonces responde 503
 *  con una explicación en vez de arrancar a medias y fallar en la primera petición. */
export function discordConfigFromEnv(): DiscordConfig | null {
  const clientId = process.env.DISCORD_CLIENT_ID;
  const clientSecret = process.env.DISCORD_CLIENT_SECRET;
  const guildId = process.env.DISCORD_GUILD_ID;
  const botToken = process.env.DISCORD_BOT_TOKEN;
  const redirectUri = process.env.DISCORD_REDIRECT_URI;
  if (!clientId || !clientSecret || !guildId || !botToken || !redirectUri) return null;
  return {
    clientId,
    clientSecret,
    guildId,
    botToken,
    redirectUri,
    tasksChannelId: process.env.DISCORD_TASKS_CHANNEL_ID,
    alertsWebhookUrl: process.env.DISCORD_WEBHOOK_ALERTS,
  };
}
