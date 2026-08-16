import { randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { canRead, canWrite, DiscordAccessDeniedError, type DiscordClient } from "./discord.js";
import type { PostgresAdminRepository } from "./postgres-admin-repository.js";

/**
 * Rutas del panel administrativo.
 *
 * Aisladas del resto de la API a propósito: es el único bloque de rutas donde la identidad la
 * resuelve un tercero (Discord) y donde la sesión viaja en cookie en vez de en `Authorization`. Ese
 * cambio de reglas conviene que esté en un archivo con nombre propio, y no repartido entre las
 * otras mil quinientas líneas.
 */

const SESSION_COOKIE = "pulso_admin";
const STATE_COOKIE = "pulso_admin_state";

const assignBodySchema = z.object({
  discordUserId: z.string().min(1).nullable(),
  username: z.string().min(1).nullable(),
});

const statusBodySchema = z.object({
  status: z.enum(["libre", "tomado", "en_revision", "hecho", "bloqueado"]),
});

const roleBodySchema = z.object({
  roleId: z.string().min(1),
  action: z.enum(["add", "remove"]),
});

export type AdminRoutesOptions = {
  admin: PostgresAdminRepository | null;
  discord: DiscordClient | null;
  incidentCode: string;
  /** A dónde vuelve el navegador tras entrar. En producción, `https://admin.pulso.my`. */
  panelUrl: string;
  secureCookies: boolean;
};

export function registerAdminRoutes(app: FastifyInstance, options: AdminRoutesOptions) {
  const { admin, discord, panelUrl, secureCookies } = options;

  /**
   * Si faltan las credenciales de Discord o la base, el panel responde 503 con una explicación en
   * vez de arrancar a medias. Un panel que carga y falla en la primera petición es peor que uno que
   * dice de entrada qué le falta.
   */
  const ready = (): { admin: PostgresAdminRepository; discord: DiscordClient } | null =>
    admin && discord ? { admin, discord } : null;

  const cookieOptions = {
    httpOnly: true,
    secure: secureCookies,
    sameSite: "lax" as const,
    path: "/",
  };

  const session = async (request: { cookies: Record<string, string | undefined> }) => {
    if (!admin) return null;
    return admin.resolveSession(request.cookies[SESSION_COOKIE]);
  };

  // --- Entrar y salir -------------------------------------------------------

  app.get("/v1/admin/auth/login", async (_request, reply) => {
    const deps = ready();
    if (!deps) {
      return reply.status(503).send({
        error: "discord_not_configured",
        message:
          "Faltan DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, DISCORD_GUILD_ID, DISCORD_BOT_TOKEN o DISCORD_REDIRECT_URI.",
      });
    }
    // `state` contra CSRF: se guarda en cookie y se compara al volver. Sin esto, cualquiera puede
    // inducir a un Maintainer a completar un inicio de sesión que no empezó.
    const state = randomBytes(16).toString("base64url");
    reply.setCookie(STATE_COOKIE, state, { ...cookieOptions, maxAge: 600 });
    return reply.redirect(deps.discord.authorizeUrl(state));
  });

  app.get("/v1/admin/auth/callback", async (request, reply) => {
    const deps = ready();
    if (!deps) return reply.status(503).send({ error: "discord_not_configured" });

    const query = request.query as { code?: string; state?: string };
    const expected = request.cookies[STATE_COOKIE];
    reply.clearCookie(STATE_COOKIE, cookieOptions);

    if (!query.code || !query.state || query.state !== expected) {
      return reply.redirect(`${panelUrl}/admin?error=state`);
    }

    try {
      const user = await deps.discord.exchangeCode(query.code);
      // Los roles se leen con el bot y no con el token del usuario: el usuario podría no tener el
      // scope `guilds.members.read`, y el bot ve el estado real del servidor.
      const member = await deps.discord.member(user.id);

      if (!canRead(member.roles)) {
        return reply.redirect(`${panelUrl}/admin?error=sin_rol`);
      }

      const { token } = await deps.admin.createSession({
        discordUserId: member.userId,
        discordUsername: member.displayName,
        discordAvatarUrl: member.avatarUrl,
        roles: member.roles,
      });
      reply.setCookie(SESSION_COOKIE, token, { ...cookieOptions, maxAge: 12 * 3600 });
      return reply.redirect(`${panelUrl}/admin`);
    } catch (error) {
      if (error instanceof DiscordAccessDeniedError) {
        return reply.redirect(`${panelUrl}/admin?error=no_miembro`);
      }
      request.log.error(error);
      return reply.redirect(`${panelUrl}/admin?error=discord`);
    }
  });

  app.post("/v1/admin/auth/logout", async (request, reply) => {
    await admin?.destroySession(request.cookies[SESSION_COOKIE]);
    reply.clearCookie(SESSION_COOKIE, cookieOptions);
    return reply.status(204).send();
  });

  app.get("/v1/admin/me", async (request, reply) => {
    if (!ready()) {
      return reply.status(503).send({
        error: "discord_not_configured",
        message: "El panel todavía no tiene credenciales de Discord configuradas.",
      });
    }
    const current = await session(request);
    if (!current) return reply.status(401).send({ error: "unauthenticated" });
    return { ...current, canWrite: canWrite(current.roles) };
  });

  // --- Lectura --------------------------------------------------------------

  const requireSession = async (
    request: { cookies: Record<string, string | undefined> },
    reply: { status: (code: number) => { send: (body: unknown) => unknown } },
  ) => {
    const current = await session(request);
    if (!current) {
      reply.status(401).send({ error: "unauthenticated" });
      return null;
    }
    return current;
  };

  app.get("/v1/admin/pulse", async (request, reply) => {
    const deps = ready();
    if (!deps) return reply.status(503).send({ error: "discord_not_configured" });
    if (!(await requireSession(request, reply))) return;
    return deps.admin.operationPulse(options.incidentCode);
  });

  app.get("/v1/admin/tasks", async (request, reply) => {
    const deps = ready();
    if (!deps) return reply.status(503).send({ error: "discord_not_configured" });
    if (!(await requireSession(request, reply))) return;
    return deps.admin.listTasks();
  });

  app.get("/v1/admin/team", async (request, reply) => {
    const deps = ready();
    if (!deps) return reply.status(503).send({ error: "discord_not_configured" });
    if (!(await requireSession(request, reply))) return;
    const [members, roles] = await Promise.all([deps.discord.members(), deps.discord.roles()]);
    return { members, roles };
  });

  // --- Escritura: solo Maintainer ------------------------------------------

  /**
   * Solo `Maintainer` escribe.
   *
   * No es jerarquía por gusto: desde aquí se reparten roles de Discord, y un rol de Discord es un
   * permiso sobre el repositorio y sobre esta misma pantalla. Repartir permisos es una acción de
   * administración, no de colaboración.
   */
  const requireWriter = async (
    request: { cookies: Record<string, string | undefined> },
    reply: { status: (code: number) => { send: (body: unknown) => unknown } },
  ) => {
    const current = await requireSession(request, reply);
    if (!current) return null;
    if (!canWrite(current.roles)) {
      reply.status(403).send({
        error: "forbidden",
        message: "Solo un Maintainer puede cambiar asignaciones y roles.",
      });
      return null;
    }
    return current;
  };

  app.patch("/v1/admin/tasks/:code/assignee", async (request, reply) => {
    const deps = ready();
    if (!deps) return reply.status(503).send({ error: "discord_not_configured" });
    const actor = await requireWriter(request, reply);
    if (!actor) return;

    const { code } = request.params as { code: string };
    const body = assignBodySchema.parse(request.body);
    const assignee =
      body.discordUserId && body.username
        ? { discordUserId: body.discordUserId, username: body.username }
        : null;

    const task = await deps.admin.assignTask(code, assignee, {
      discordUserId: actor.discordUserId,
      username: actor.discordUsername,
    });
    if (!task) return reply.status(404).send({ error: "task_not_found" });

    if (assignee) {
      await deps.discord.alert(
        `**${task.code}** · ${task.title}\nAsignado a <@${assignee.discordUserId}> por ${actor.discordUsername}.`,
      );
    }
    return task;
  });

  app.patch("/v1/admin/tasks/:code/status", async (request, reply) => {
    const deps = ready();
    if (!deps) return reply.status(503).send({ error: "discord_not_configured" });
    const actor = await requireWriter(request, reply);
    if (!actor) return;

    const { code } = request.params as { code: string };
    const { status } = statusBodySchema.parse(request.body);
    const task = await deps.admin.setTaskStatus(code, status, {
      discordUserId: actor.discordUserId,
      username: actor.discordUsername,
    });
    if (!task) return reply.status(404).send({ error: "task_not_found" });
    return task;
  });

  /** Publica el ticket como hilo en el foro `#tareas`, para que la conversación viva donde vive el
   *  equipo y no dentro del panel. */
  app.post("/v1/admin/tasks/:code/publish", async (request, reply) => {
    const deps = ready();
    if (!deps) return reply.status(503).send({ error: "discord_not_configured" });
    const actor = await requireWriter(request, reply);
    if (!actor) return;

    const { code } = request.params as { code: string };
    const task = (await deps.admin.listTasks()).find((item) => item.code === code);
    if (!task) return reply.status(404).send({ error: "task_not_found" });

    const body = [
      `**${task.priority} · ${task.size} · ${task.roles.join(", ")}**`,
      "",
      task.summary ?? "",
      "",
      task.acceptance ? `**Acepta cuando:** ${task.acceptance}` : "",
      task.dependsOn.length ? `**Depende de:** ${task.dependsOn.join(", ")}` : "",
      "",
      `Rama sugerida: \`${task.priority.toLowerCase()}/${task.code.toLowerCase()}-...\``,
      "Para tomarlo, responde en este hilo.",
    ]
      .filter(Boolean)
      .join("\n");

    const threadId = await deps.discord.publishTaskThread(`${task.code} · ${task.title}`, body);
    if (!threadId) {
      return reply.status(503).send({
        error: "tasks_channel_not_configured",
        message: "Falta DISCORD_TASKS_CHANNEL_ID: el canal de foro donde se publican los tickets.",
      });
    }
    await deps.admin.recordThread(code, threadId);
    return { code, threadId };
  });

  app.patch("/v1/admin/team/:userId/roles", async (request, reply) => {
    const deps = ready();
    if (!deps) return reply.status(503).send({ error: "discord_not_configured" });
    const actor = await requireWriter(request, reply);
    if (!actor) return;

    const { userId } = request.params as { userId: string };
    const { roleId, action } = roleBodySchema.parse(request.body);

    // Nadie se quita a sí mismo el rol que le da acceso a esta pantalla. Es la forma más fácil de
    // quedarse fuera del panel sin manera de volver a entrar.
    if (userId === actor.discordUserId && action === "remove") {
      const roles = await deps.discord.roles();
      const target = roles.find((role) => role.id === roleId);
      if (target?.name.toLowerCase() === "maintainer") {
        return reply.status(409).send({
          error: "self_lockout",
          message: "No puedes quitarte tu propio rol de Maintainer desde aquí.",
        });
      }
    }

    if (action === "add") await deps.discord.addRole(userId, roleId);
    else await deps.discord.removeRole(userId, roleId);

    return deps.discord.member(userId);
  });
}
