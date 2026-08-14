# Seguridad, confiabilidad y preparación de producción

## Clasificación de información

| Clase | Ejemplos | Tratamiento |
|---|---|---|
| Pública | agregados territoriales, necesidades publicables | CDN y API pública |
| Interna | planes, inventario general, métricas operacionales | usuarios autenticados |
| Restringida | teléfonos, documentos, ubicación exacta, rutas | cifrado y permisos específicos |
| Altamente restringida | biometría, salud, protección, víctimas | minimización, acceso excepcional y auditoría |

Los datos comerciales sensibles —precios, contratos, rutas y resultados privados de calidad— se clasifican separadamente de los datos personales.

## Matriz mínima de acceso

- Ciudadano: crea y consulta únicamente su reporte mediante capacidad limitada.
- Brigadista: opera sobre zonas y misiones asignadas.
- Bodeguero: recibe y mueve inventario en ubicaciones autorizadas.
- Inspector: registra calidad; no ajusta inventario por sí solo.
- Logística: reserva, despacha y rastrea transporte.
- Receptor: acepta o disputa una entrega.
- Profesional: certifica dentro de especialidad y alcance.
- Coordinador: administra operación dentro de su organización/emergencia.
- Auditor: lectura amplia y decisiones de revisión, sin editar evidencia original.
- Administrador: configura la emergencia; no obtiene acceso automático a datos altamente restringidos.

La autorización combina rol, organización, emergencia, territorio, ubicación logística y acción.

## Objetivos iniciales de servicio

Objetivos provisionales que deben validarse con responsables operacionales:

- API operacional: 99,9% mensual durante emergencia activa.
- Lecturas comunes: p95 menor a 500 ms, sin incluir cargas de archivos.
- Aceptación de sincronización: p95 menor a 2 s para lotes pequeños.
- Procesamiento de evidencia: 95% en menos de 5 minutos cuando proveedores estén disponibles.
- PWA: operación de captura sin red durante al menos 72 horas según capacidad del dispositivo.
- Ninguna pérdida aceptable de operaciones confirmadas por el servidor.

## Recuperación

- RPO objetivo de PostgreSQL: 5 minutos en emergencia activa.
- RTO objetivo del núcleo operacional: 60 minutos.
- Versionado y replicación del almacenamiento de evidencias.
- Copias cifradas con restauración ensayada, no solo creación exitosa.
- Exportación offline periódica de misiones y datos críticos para contingencia.
- Procedimiento documentado para reconstruir proyecciones desde eventos y movimientos.

## Seguridad técnica

- TLS, HSTS y cifrado administrado de discos y objetos.
- Secretos fuera del repositorio y rotación documentada.
- Tokens cortos, revocación de dispositivos y sesiones por riesgo.
- MFA para administradores, auditores y operaciones de alto impacto.
- Antivirus, validación de tipo real, límites y cuarentena de archivos.
- Protección contra abuso, enumeración, cargas excesivas y automatización maliciosa.
- Dependencias fijadas, análisis automatizado y proceso de actualización.
- Separación de entornos y prohibición de datos reales en desarrollo.
- Revisiones periódicas de permisos y accesos de emergencia con vencimiento.

La integración posterior con Solana exige además:

- clave del relayer en HSM/MPC, nunca en variables de un navegador o dispositivo de campo;
- autoridad del programa separada mediante multisig;
- dos proveedores RPC independientes y cambio automático por salud;
- espera de compromiso `finalized` para registrar un anclaje como definitivo;
- límites diarios de SOL patrocinado y alertas por comportamiento anómalo;
- conciliación entre outbox, manifiestos, secuencias del programa y firmas finalizadas.

## Observabilidad

Métricas mínimas:

- disponibilidad, latencia y errores por endpoint;
- dispositivos sin sincronizar y antigüedad de la última sincronización;
- tamaño, reintentos y edad de colas;
- fallos de procesamiento de evidencia;
- diferencias y ajustes de inventario;
- eventos de autorización denegada;
- uso de almacenamiento y capacidad de base de datos;
- salud de respaldos y última restauración exitosa.
- secuencias Solana pendientes, expiradas, reintentadas y finalizadas.

Alertas deben tener propietario, prioridad, canal y procedimiento de respuesta.

## Ciclo de vida de datos

Cada tipo de dato define finalidad, responsable, base jurídica, ubicación, periodo de retención, acceso y forma de eliminación o anonimización. Cerrar una emergencia no elimina automáticamente su información; inicia un proceso controlado de archivo, exportación y depuración.

## Accesibilidad e idiomas

- Interfaz operable con teclado y lectores de pantalla.
- Contraste y estados que no dependan solo del color.
- Formularios breves, lenguaje claro y validación comprensible.
- Español como idioma inicial; textos y catálogos externalizados para traducción.
- Fechas, números y unidades adaptados sin cambiar los valores canónicos.

## Preparación operacional

Antes de producción debe existir:

- responsable de guardia y escalamiento;
- runbook de indisponibilidad, filtración, pérdida de dispositivo y datos incorrectos;
- inventario de proveedores y dependencias externas;
- simulacro de restauración y operación degradada;
- capacitación por rol;
- canal de soporte y reporte de vulnerabilidades;
- revisión de impacto de privacidad y seguridad;
- decisión aprobada sobre licencia de código y datos.
