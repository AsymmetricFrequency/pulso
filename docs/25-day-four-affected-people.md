# Día 4: personas afectadas, coordinación y ayuda trazable

## Decisión operativa

PULSO VIDA no reemplaza el Registro Único de Familias en Emergencia (RUFE), el SIRDEC, la línea de daños, los organismos de socorro ni las plataformas ciudadanas. Los conecta mediante un expediente común, conserva la procedencia de cada dato y evita que una señal ciudadana se convierta automáticamente en una persona beneficiaria.

En Cali, el RUFE se diligencia presencialmente, casa a casa y por personal autorizado. La Alcaldía ha advertido que no existe censo mediante QR, teléfono, formulario digital, redes sociales o mensajería. Por tanto, PULSO VIDA no debe publicar un botón llamado “inscribirme para recibir ayuda” ni afirmar que un reporte garantiza asistencia.

La función de la plataforma desde el cuarto día es mantener una imagen operacional común:

`señal → caso → verificación en campo → caracterización oficial → necesidad validada → asignación → entrega → seguimiento`

## Situación observada en Cali

La revisión del repositorio oficial y de los canales publicados por la ciudad muestra varios flujos paralelos:

- el rescate y la búsqueda continúan en puntos activos;
- la Personería, Fiscalía, SIJIN y CTI gestionan la ruta oficial de personas desaparecidas mediante SIRDEC y el Mecanismo de Búsqueda Urgente;
- la Alcaldía recibe reportes de daños de inmuebles por un WhatsApp específico;
- Gestión del Riesgo, Vivienda y Bienestar Social realizan el RUFE presencial;
- equipos profesionales evalúan habitabilidad y riesgo estructural;
- albergues, centros de acopio, bancos de sangre y organizaciones comunitarias gestionan flujos propios;
- aplicaciones ciudadanas publican mapas de necesidades o registros de personas, pero no comparten todavía un expediente ni estados comunes.

Esto crea el problema central: una misma familia puede aparecer en un albergue, un formulario ciudadano, un reporte de daño y el RUFE sin que esos registros se reconozcan como el mismo caso. Al mismo tiempo, una vivienda puede alojar varias familias y una persona puede tener varias necesidades. Deducir que “misma dirección” significa “duplicado” excluiría personas legítimas.

## Qué identifica PULSO VIDA

PULSO VIDA separa entidades que suelen mezclarse:

| Entidad | Qué representa | Regla clave |
| --- | --- | --- |
| Persona | Un ser humano afectado, desaparecido, localizado o integrante de un hogar | Puede existir sin documento ni teléfono |
| Hogar | Personas que comparten normalmente recursos y cuidado | No equivale necesariamente a una dirección |
| Lugar afectado | Vivienda, edificio, predio, albergue o punto temporal | Puede contener varios hogares |
| Caso de emergencia | Expediente de atención dentro de un incidente | Una persona u hogar puede tener más de un caso relacionado |
| Afirmación de fuente | Lo que reportó RUFE, SIRDEC, un hospital, albergue, brigada o plataforma | Nunca se pierde la procedencia ni la fecha |
| Necesidad | Agua, alimento, salud, alojamiento, protección, material u otra brecha | Tiene cantidad, prioridad, estado y vigencia |
| Prestación/entrega | Bien o servicio asignado y efectivamente recibido | No se confunde con una promesa o despacho |

El identificador público es un código de caso aleatorio. Los documentos, teléfonos y direcciones exactas permanecen cifrados y separados de la vista pública. Para comparar identificadores sin exponerlos se utilizan huellas HMAC específicas del incidente.

## Estados de una persona u hogar afectado

1. **Referido:** llegó una señal de cualquier canal; todavía no está comprobada.
2. **Contactado o localizado:** un equipo estableció contacto o ubicación aproximada.
3. **Verificado en campo:** una brigada identificada registró presencia y evidencia mínima.
4. **Caracterizado oficialmente:** existe referencia válida al RUFE u otra autoridad competente.
5. **Elegibilidad revisada:** la entidad responsable evaluó el tipo de asistencia aplicable.
6. **Atención activa:** hay necesidades abiertas, asignaciones o servicios en curso.
7. **Recuperado/cerrado:** no quedan brechas abiertas, con posibilidad de reapertura.
8. **En disputa:** existe conflicto, posible duplicidad o reclamación que requiere revisión humana.

Una señal comunitaria nunca salta directamente a “caracterizado oficialmente”. Una persona sin documento tampoco queda bloqueada: puede ser verificada mediante visita, relaciones familiares, albergue, autoridad local y otras fuentes, dejando explícito el nivel de confianza.

## Deduplicación sin excluir

El sistema genera candidatos de coincidencia usando señales ponderadas:

- huella del documento, cuando existe y hay base legal para tratarlo;
- nombre normalizado, fecha de nacimiento y parentescos;
- teléfonos o contactos alternos;
- hogar, lugar afectado y proximidad geográfica;
- referencias externas, como número RUFE, SIRDEC, albergue o reporte de daños;
- fotografías de evidencia para detectar archivos repetidos, no reconocimiento facial;
- tiempo, equipo que capturó y fuente original.

El resultado puede ser `sin coincidencia`, `posible coincidencia` o `alta coincidencia`. Solo una persona autorizada fusiona expedientes. La ayuda urgente no se suspende por una coincidencia automática. Una fusión conserva ambos registros, su procedencia y una operación reversible de separación.

## Canales e interoperabilidad

### RUFE y equipos oficiales

PULSO VIDA funciona como herramienta de apoyo para equipos autorizados: asigna zonas, trabaja offline, registra la visita y enlaza el código del formulario físico. Solo mediante acuerdo institucional debe digitalizar campos oficiales o intercambiar datos personales. Sin ese acuerdo, conserva únicamente la referencia y el estado mínimo autorizado.

### WhatsApp

WhatsApp sirve como entrada asistida, no como censo. El flujo recomendado:

1. recibe texto, audio, ubicación o foto;
2. responde con rutas oficiales y una advertencia clara de que el reporte no garantiza ayuda;
3. extrae una necesidad estructurada y crea una referencia no verificada;
4. pide únicamente los datos mínimos y consentimiento para compartirlos;
5. envía el caso a triage o a un equipo territorial;
6. notifica cambios de estado sin revelar datos sensibles.

La IA puede clasificar mensajes y detectar urgencia, pero nunca valida identidad, daño estructural ni elegibilidad.

### Plataformas comunitarias

Las plataformas existentes deben tratarse como fuentes federadas, no como competencia. PULSO VIDA ofrecerá importación CSV/JSON, API abierta, taxonomía compartida, atribución de fuente, cola de duplicados y webhooks de cambio de estado. Una integración conserva el identificador original y permite devolver al sistema de origen el estado `recibido`, `en revisión`, `asignado`, `atendido` o `cerrado`.

## Operación desde el cuarto día

PULSO Operaciones organiza seis carriles simultáneos:

1. **Vida y rescate:** señales críticas, zonas activas, derivación inmediata a organismos oficiales.
2. **Reunificación familiar:** referencias ciudadanas y estado oficial, sin publicar ubicaciones sensibles.
3. **Seguridad de vivienda:** reporte, visita, evaluación profesional y decisión de habitabilidad.
4. **Familias afectadas:** barrido territorial, referencia RUFE, composición del hogar y protección.
5. **Necesidades y albergues:** demanda vigente, capacidad, población prioritaria y seguimiento.
6. **Donaciones y logística:** oferta, recepción, inspección, inventario, asignación, despacho y entrega.

Cada sala operacional visualiza tres colas: `urgente sin asignar`, `asignado sin confirmar` y `vencido/sin actualización`. La ausencia de reportes no se interpreta como ausencia de daños; el mapa también muestra zonas no visitadas.

## Donaciones que empiezan a llegar

La cadena mínima es:

`oferta → recepción → inspección → lote → bodega → asignación contra necesidad validada → despacho → entrega confirmada`

- Una promesa no aumenta inventario.
- Una recepción no cuenta como ayuda entregada.
- Los materiales incompatibles no se suman.
- Cada lote conserva unidad, cantidad aceptada, condición, vencimiento cuando aplica y ubicación.
- La asignación se hace contra una necesidad vigente de un territorio, hogar o instalación.
- La entrega se confirma por receptor autorizado, evidencia o segunda verificación según el riesgo.
- El mapa público muestra agregados y brechas; nunca nombres, teléfonos, bodegas vulnerables ni direcciones exactas.

## Qué se publica

La landing pública muestra por departamento, municipio, localidad y zona operativa:

- hogares referidos, verificados y caracterizados, siempre agregados;
- personas desaparecidas/localizadas únicamente con la política y fuente autorizadas;
- zonas visitadas, parcialmente cubiertas y todavía sin verificar;
- daños reportados, evaluados y pendientes;
- necesidades abiertas, atendidas parcialmente y cerradas;
- donaciones prometidas, recibidas, disponibles, asignadas y entregadas;
- equipos desplegados y frescura de la información;
- fuente, fecha de corte, metodología y nivel de confianza.

Los umbrales de privacidad impiden publicar celdas pequeñas o combinaciones que permitan identificar un hogar. Solana conserva únicamente la huella del corte publicado; no contiene información personal ni decide quién recibe ayuda.

## Comparación funcional de iniciativas encontradas

El inventario es de iniciativas públicamente localizables al 14 de agosto de 2026; no pretende afirmar que sean todas las existentes.

| Iniciativa | Aporte observado | Límite que PULSO VIDA debe resolver |
| --- | --- | --- |
| Repositorio oficial de Cali | Cifras, canales, albergues, centros de acopio, sangre y comunicados | Es informativo; los flujos operativos permanecen distribuidos |
| RUFE Cali | Caracterización oficial presencial de familias | Requiere enlazar visitas, necesidades y seguimiento sin crear un censo falso |
| Personería/SIRDEC | Ruta oficial de desaparición y búsqueda inmediata | Necesita interoperar con referencias ciudadanas sin duplicar ni exponer casos |
| Aquí Hace Falta | Mapa ciudadano de necesidades verificadas en Valle del Cauca | Debe compartir estados, fuentes y resolución con otros sistemas |
| SUMA | Mapa comunitario en tiempo real para necesidades, albergues, acopios, sangre y personal | La actualización comunitaria necesita identidad de actores, deduplicación y derivación institucional |
| Ayuda Terremoto Colombia | Recopila daños, necesidades, albergues, acopios, vías y líneas oficiales | Requiere procedencia uniforme, cierre de casos y conexión con entregas verificadas |
| terremoto.com.co | Reportes geográficos de personas atrapadas, daños y desaparecidos | Señal temprana valiosa; requiere derivación y cierre institucional verificable |
| Colombia te busca | Registro ciudadano nacional de personas desaparecidas | No sustituye SIRDEC; requiere conciliación cuidadosa y privacidad |
| SISMO911 | Modelo amplio de casos, mapas y reunificación | Está orientado a Venezuela y no representa autoridad colombiana |
| HaciendoComunidad | Enlace difundido para comunidad | El enlace revisado ya devuelve 404, lo que evidencia riesgo de continuidad |
| Ayudas Pereira | Enlace difundido en redes | El dominio visto en la captura no resolvió durante la revisión |

## Construcción priorizada

### P0 — siguientes 48 horas

- entidades `person`, `household`, `affected_place`, `disaster_case`, `source_claim` y `external_reference`;
- estados de caso y bitácora append-only;
- importador CSV/JSON con fuente y consentimiento;
- cola de posibles duplicados y fusión reversible;
- vista territorial de hogares referidos, verificados y caracterizados;
- recepción de WhatsApp como referencia no verificada, con mensajes de seguridad;
- flujo de necesidad → asignación → entrega conectado al inventario existente.

### Primer importador implementado

El comando `pnpm --filter @pulso/worker ingest:cali` consulta una sola vez el repositorio oficial de Cali y extrae exclusivamente información pública operacional:

- balance de fallecidos, lesionados, edificaciones con colapso total, desaparecidos y rescatados;
- fecha visible de actualización y enlace al último reporte oficial;
- centros de acopio y su estado abierto/cerrado;
- albergues temporales;
- bancos de sangre, dirección, horario publicado y enlace cartográfico.

Sin `DATABASE_URL`, el comando produce una vista previa JSON. Con `DATABASE_URL`, conserva la fuente, ejecución, registro vigente y versiones históricas. Usa `ETag` y `Last-Modified` cuando el servidor los ofrece, identifica el agente como PULSO VIDA y respeta el `crawl-delay` publicado. No extrae listados nominales de personas, teléfonos privados, fotografías ni expedientes individuales.

### P0 — operación segura

- roles separados para capturar, corroborar, caracterizar, asignar y confirmar;
- cifrado de PII, HMAC por incidente, retención y borrado definidos;
- registro de consentimiento y finalidad de uso;
- mecanismo de disputa, corrección y auditoría;
- exportación para autoridades y retorno de estado a plataformas aliadas;
- revisión jurídica y convenio antes de intercambiar RUFE o SIRDEC.

### P1

- conectores institucionales con autorización;
- reglas de matching configurables y métricas de falsos positivos;
- portal de aliados y webhooks firmados;
- recibo de caso consultable sin cuenta, usando código y dato adicional;
- análisis de zonas silenciosas y hogares vulnerables sin cobertura.

## Fuentes revisadas

- Alcaldía de Cali, repositorio oficial: <https://www.cali.gov.co/gobierno/publicaciones/193607/terremoto-de-cali-repositorio-oficial-de-informacion/>
- Alcaldía de Cali, censo presencial sin QR ni línea telefónica: <https://www.cali.gov.co/gobierno/publicaciones/193651/censo-de-familias-afectadas-por-el-terremoto-sera-presencial-no-habra-qr-ni-linea-telefonica/>
- Alcaldía de Cali, caracterización mediante RUFE: <https://www.cali.gov.co/gobierno/publicaciones/193666/alcaldia-de-cali-inicia-caracterizacion-de-familias-damnificadas-por-el-sismo-mediante-el-registro-unico-de-familias-en-emergencia/>
- Personería de Cali, declaración de desaparecidos: <https://personeriacali.gov.co/servicios-declaracion-de-desaparecidos/>
- Servicio Geológico Colombiano, Sismo Sentido: <https://sismosentido.sgc.gov.co/>
- Aquí Hace Falta: <https://aqui-hace-falta.web.app/>
- SUMA: <https://suma.web.app/>
- Ayuda Terremoto Colombia: <https://ayudaterremotocolombia.com/>
- terremoto.com.co: <https://terremoto.com.co/>
- Colombia te busca: <https://colombiatebusca.com/>
- SISMO911: <https://sismo911.com/>

## Criterio de éxito

PULSO VIDA funciona cuando puede responder, sin exponer a una persona:

> Esta señal llegó por este canal; un equipo autorizado visitó este lugar; corresponde a este hogar sin fusionarlo indebidamente; esta necesidad sigue vigente; este lote fue asignado; esta entrega fue confirmada; y el agregado público conserva la integridad del corte publicado.
