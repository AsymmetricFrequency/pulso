import type { PublicCommunityReportDto } from "@pulso/schemas";

/**
 * El aviso que se manda a `#alertas` cuando alguien reporta personas atrapadas.
 *
 * Cierra `P0-6`. Hasta ahora un reporte de rescate se quedaba esperando a que alguien mirara la
 * pantalla: toda la ventaja de que reportar sea rápido se perdía en el último tramo.
 *
 * **Qué lleva y por qué ese orden.** Primero cuántas personas y si se oyen señales de vida, porque
 * son los dos datos con los que un coordinador decide a cuál de dos puntos manda el equipo que
 * tiene. Después si ya hay alguien en el sitio, que es lo que evita mandar un segundo equipo a un
 * punto atendido mientras otro sigue sin nadie. Y al final el enlace para navegar.
 *
 * **Por qué un enlace de mapas y no solo el nuestro.** A quien conduce le sirve la ruta, no nuestra
 * ficha. El enlace de Pulso va también, para el contexto; el de navegación va primero porque es el
 * que se usa con el carro en marcha.
 */

const SIGNS: Record<string, string> = {
  yes: "**SE OYEN SEÑALES DE VIDA**",
  unknown: "señales sin confirmar",
  no: "no se percibieron señales",
};

export function rescueAlertMessage(
  report: PublicCommunityReportDto,
  siteUrl: string,
): string | null {
  // Solo los rescates. El resto de reportes no despierta a nadie: un canal que suena por todo es un
  // canal que la gente silencia, y entonces el aviso que importa tampoco llega.
  if (report.reportType !== "rescate") return null;

  const [lon, lat] = report.location.coordinates;
  const people =
    typeof report.peopleReported === "number" && report.peopleReported > 0
      ? `**${report.peopleReported} persona${report.peopleReported === 1 ? "" : "s"}** reportadas`
      : "número de personas sin especificar";
  const signs = report.signsOfLife ? SIGNS[report.signsOfLife] : "señales sin confirmar";

  return [
    // El `@everyone` no es énfasis: es la única forma de que esto suene.
    //
    // El servidor tiene Comunidad activada, y Discord **obliga** a esos servidores a «Solo
    // @menciones» —le quita el ajuste—. Sin mención, este aviso llega al canal y no despierta a
    // nadie, que es exactamente el fallo que P0-6 existe para cerrar.
    //
    // Y es el único sitio del sistema donde se usa. Un canal que menciona a todos por cualquier
    // cosa acaba silenciado, y entonces tampoco suena el día que hay alguien bajo escombros.
    "@everyone",
    "🆘 **RESCATE REPORTADO**",
    report.title,
    "",
    `${people} · ${signs}`,
    report.respondersOnSite === true
      ? "Ya hay un equipo en el sitio según quien reporta."
      : "**Sin equipo en el sitio** según quien reporta.",
    "",
    `Ir: <https://www.google.com/maps/search/?api=1&query=${lat},${lon}>`,
    `Mapa: <${siteUrl}/#mapa>`,
    "",
    // Se dice en cada aviso, no una vez en el canal: quien lo lea a las 3 de la mañana no va a
    // recordar el matiz. Un reporte ciudadano no está verificado por nadie.
    "_Reporte ciudadano sin verificar. Confirma antes de mover un equipo._",
  ].join("\n");
}
