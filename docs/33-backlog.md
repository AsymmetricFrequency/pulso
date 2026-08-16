# Backlog

Cada línea de aquí es un ticket que **una persona puede tomar y terminar sin pedir contexto**. Ese es
el criterio de calidad de este documento: si al leer un ticket hay que preguntar qué significa, el
ticket está mal escrito y hay que arreglarlo, no responder la pregunta en privado.

**Cómo leerlo**

- `P0`–`P3`: prioridad de [`32-direccion.md`](32-direccion.md). `PL` = plataforma (sostiene al resto).
- **Tamaño**: `S` menos de un día · `M` dos o tres días · `L` una semana o más.
- **Rol**: el rol de Discord que lo toma. Coincide con la etiqueta del issue.
- **Bloquea / depende**: si dice algo, léelo antes de empezar.

**Cómo se toma un ticket:** comentar el hilo en Discord → *assignee* en GitHub → rama
`p0/rescate-cola-operaciones` → PR. El detalle está en [`CONTRIBUTING.md`](../CONTRIBUTING.md).

---

## Corto plazo — los próximos días

Todo lo de esta sección es P0 o desbloquea P0.

### `P0-1` · Cola de rescate en Operaciones · **L** · Frontend + Backend

Existe el tipo de reporte `rescate` y el mapa lo pinta, pero quien coordina no tiene dónde
trabajarlo: la consola de Operaciones lista todos los reportes juntos.

Hace falta una vista propia que muestre solo rescates, ordenados por señales de vida y luego por
antigüedad, con el estado de atención visible y un botón para marcar «equipo asignado» y «resuelto».

- **Acepta cuando:** un coordinador ve los rescates abiertos sin filtrar nada, en menos de tres
  segundos sabe cuál atender primero, y al marcar uno como atendido desaparece de la cola activa sin
  borrarse del historial.
- **Ojo:** «resuelto» no es un estado de revisión (`validated`), es otra cosa. No los mezcles en la
  misma columna — ver la invariante 2 de [`32-direccion.md`](32-direccion.md).
- **Depende de:** nada. Se puede empezar ya.

### `P0-2` · Que un rescate sobreviva a la falta de señal · **M** · Frontend

Un derrumbe es exactamente donde peor anda la red. Hoy si el `POST` falla, el formulario dice «sin
conexión» y el reporte se pierde.

Ya existe la cola offline en IndexedDB de Pulso Campo (`14-persistence-field-offline.md`); esto es
reusarla para el reporte ciudadano.

- **Acepta cuando:** con el modo avión puesto, enviar un rescate muestra «guardado, se enviará
  solo», y al volver la señal llega sin duplicarse (`clientMutationId` ya da idempotencia).
- **Tamaño real:** la mitad del trabajo es la interfaz honesta — decirle a la persona que su reporte
  aún no salió, sin que parezca que sí.

### `P0-3` · Marcar un rescate como atendido desde el mapa público · **S** · Frontend + Backend

Si un equipo ya llegó a un punto, quien pasa por ahí debería poder decirlo sin entrar a Operaciones.
Es el dato que evita el peor desperdicio de esta fase: dos equipos al mismo sitio y ninguno al otro.

- **Acepta cuando:** desde el detalle de un rescate se puede reportar «ya hay equipo aquí» sin
  cuenta, con el mismo límite de tasa que el resto, y el marcador cambia de aspecto.
- **Ojo:** es una señal ciudadana, no un cierre. No debe poder sacar un rescate de la cola por sí
  sola.

### `P0-4` · Difusión del botón de rescate · **M** · Contributor (no requiere código)

La función más rápida del mundo no sirve si nadie en Cali sabe que existe. Hace falta una pieza
corta y compartible, y llevarla a los canales donde ya está la gente: los grupos de barrio, las
cuentas que ya publican mapas, los organismos de socorro.

- **Acepta cuando:** existe la pieza, está publicada, y podemos nombrar tres canales donde llegó.
- **Ojo:** el mensaje tiene que decir «llama al 123 primero». Sin esa frase, no se publica.

### `P0-6` · Avisar a los rescatistas cuando entra un reporte · **M** · Backend + DevOps

Hoy un reporte de personas atrapadas se queda esperando a que alguien mire la pantalla. Sin aviso,
toda la ventaja de que reportar sea rápido se pierde en el último tramo.

El webhook de `#alertas` ya existe y el cliente de Discord ya sabe publicar; falta disparar en el
momento del reporte, y una segunda vía que no dependa de que alguien tenga Discord abierto.

- **Acepta cuando:** al enviar un rescate, en menos de un minuto aparece un aviso en `#alertas` con
  las personas, las señales de vida y un enlace al punto.
- **Ojo:** un fallo al avisar **nunca** puede impedir que el reporte se guarde. El aviso se manda
  después de escribir, no antes, y su error se traga — igual que en `DiscordClient.alert`.

### `P0-7` · Sala de situación por ciudad · **L** · Frontend + GIS

Pulso pinta 2.300 puntos sobre el país y **no responde «qué pasa en esta ciudad ahora mismo»**. Para
coordinar un rescate esa es la única pregunta que importa, y hoy exige entrar a un departamento,
esperar a que cargue el otro motor de mapa y contar puntos a ojo.

Una pantalla por ciudad con los puntos críticos juntos: rescates abiertos, PMU, albergues y carpas,
centros de acopio, necesidades sin cubrir.

- **Acepta cuando:** desde el informe público se elige una ciudad y se ven sus puntos críticos
  agrupados por tipo, cada uno con cuándo se reportó y su estado. Los rescates van arriba y
  separados.
- **Ojo:** no esperes a `PL-1`. Esta vista puede salir con lo que hay; si se ata al mapa único, se
  queda esperando una decisión que todavía no está tomada.

### `P0-8` · Distinguir un alojamiento temporal de un centro de acopio · **M** · Backend + Frontend

Hoy todo cae en la categoría `refugio` o en un PMU, y no son lo mismo: una carpa donde duerme gente
esta noche tiene capacidad, ocupación y necesidades propias; un acopio recibe y despacha. Mezclarlos
hace que el mapa no pueda decir **dónde queda espacio para alojar a alguien**.

- **Acepta cuando:** un alojamiento temporal se reporta como tal, con capacidad y ocupación
  aproximadas, y el mapa lo distingue de un acopio a simple vista.
- **Ojo:** las fuentes externas ya ingeridas se reclasifican sin perder procedencia. Nada de borrar
  y volver a importar.

### `P0-10` · Vías bloqueadas y aeropuertos cerrados en el mapa · **M** · Backend + Frontend + Data

Un equipo de rescate necesita saber **por dónde puede llegar** antes de saber a dónde va. Gravitas
nos da 14 cierres —derrumbes sobre la calzada, aeropuertos sin operación en Cali, Buenaventura,
Cartago, Quibdó, Armenia, Manizales, Pereira, Bogotá e Ibagué— y los descartamos en la ingesta.

- **Acepta cuando:** un cierre se ve con símbolo propio, distinto de un acopio y de un PMU, y dice
  desde cuándo está cerrado.
- **Ojo — no es de una línea.** `mapGravitasFeature` fija `reportType: "pmu"`. Añadir `logistica` a
  `IMPORTABLE_CATEGORIES` sin más metería una vía cerrada al mapa como Puesto de Mando Unificado, y
  un coordinador leería que hay mando en el aeropuerto de Buenaventura. Hace falta un
  `report_type` propio; la migración `024_rescue_reports.sql` muestra cómo se amplía el CHECK.
- **Depende de:** nada. La spec completa está en el panel administrativo.

### `P0-5` · Que el triaje de contratos corra · **S** · AI + DevOps

Está desplegado y quieto: falta `ANTHROPIC_API_KEY` en `/opt/pulso/.env`. Son ~3 USD por los 357
contratos. Es P3, pero es de una hora y desbloquea toda la cola de auditoría.

- **Acepta cuando:** corrió con `PULSO_TRIAGE_LIMIT=20`, alguien leyó los 20 razonamientos y dijo si
  el criterio sirve, y solo entonces corrió el resto. Ver [`31-contract-triage.md`](31-contract-triage.md).

---

## Mediano plazo — dos a cuatro semanas

### `P1-1` · API del censo de damnificados · **L** · Backend

**El hueco más grande del proyecto.** La migración `012_affected_cases_source_ingestion.sql` modela
personas, hogares, lugares afectados, casos, afirmaciones de fuente y candidatos de duplicado — y no
existe **un solo endpoint** que lo toque. El modelo está y el producto no.

Hace falta el repositorio dual (memoria y Postgres), los esquemas Zod, y las rutas de operaciones
para crear un caso, adjuntar una afirmación de fuente y avanzar de estado.

- **Acepta cuando:** desde Operaciones se puede registrar una persona afectada sin documento,
  adjuntarle una necesidad, y ver su estado en la máquina de estados de
  [`25-day-four-affected-people.md`](25-day-four-affected-people.md) — que ya está escrita y hay que
  respetar, no reinventar.
- **Ojo:** los documentos y teléfonos van cifrados (`apps/api/src/field-encryption.ts`) y nunca
  salen por una ruta pública. Esto es la invariante 1 y hay una revisión de Maintainer obligatoria.
- **Se puede partir en tres:** esquemas + dominio · repositorios · rutas. Tres personas, tres PRs.

### `P1-2` · Consola del censo · **L** · Frontend

La interfaz de lo anterior. **No empezar hasta que `P1-1` tenga los esquemas mergeados**, o se
construye contra una forma que va a cambiar.

- **Depende de:** `P1-1`.

### `P1-3` · Bandeja de posibles duplicados · **M** · Backend + AI

Una familia aparece en un albergue, en un formulario ciudadano y en el RUFE. La migración `012` ya
tiene la tabla de candidatos; falta generarlos y una bandeja donde una persona los resuelva.

- **Ojo:** «misma dirección» no significa «duplicado» — una vivienda puede alojar varias familias, y
  fusionarlas excluye gente que sí tiene derecho a ayuda. El razonamiento completo está en
  [`25-day-four-affected-people.md`](25-day-four-affected-people.md).
- **Depende de:** `P1-1`.

### `P2-1` · Emparejar necesidad con oferta · **L** · Backend + Frontend

Hoy el mapa muestra necesidades y muestra centros de acopio, y nadie los conecta. El emparejamiento
es todo el valor de P2 y está sin construir.

- **Acepta cuando:** dado un punto con una necesidad abierta, la interfaz muestra qué acopio cercano
  tiene ese insumo, y se puede registrar un compromiso de entrega que después se confirma.
- **Ojo:** promesa, despacho y entrega son tres cosas distintas y ya están modeladas así en
  [`10-material-donations.md`](10-material-donations.md). No colapsarlas en un booleano.

### `PL-1` · Un solo motor de mapa · **L** · GIS

Hoy hay dos: `atlas-map.tsx` (d3-geo, vista país) y `leaflet-map.tsx` (vista departamento). Entrar a
un departamento **cambia de motor** en vez de hacer zoom, y eso es la raíz de la fricción para
agregar o mover puntos: todo hay que implementarlo dos veces.

- **Ojo — esto ya se intentó y falló.** La migración a MapLibre se revirtió con el lienzo en blanco
  y sin diagnóstico (commits `20e61e1`…`ff9a0c4`). **No repetir el intento cambiando el mapa de
  producción.** Prototipo aislado primero, en una ruta aparte, hasta verlo pintar con datos reales.
- **Acepta cuando:** el prototipo renderiza país y municipio en un solo motor con los puntos reales,
  y hay una nota de una página diciendo por qué falló el intento anterior y por qué este no.
- **Decisión abierta:** cuál motor. La decide GIS con un Maintainer, no un PR.

### `PL-2` · Agregar y mover puntos sin fricción · **M** · Frontend + GIS

Lo que pidió la dirección con esas palabras. Hoy, corregir la ubicación de un punto mal puesto
implica base de datos.

- **Acepta cuando:** desde Operaciones se arrastra un marcador a su sitio correcto y queda guardado
  con historial de quién lo movió y desde dónde.
- **Depende de:** conviene que `PL-1` esté decidido, aunque no terminado.

### `PL-3` · Panel de administración de Pulso con Discord · **L** · Backend + Frontend

Diseño completo, decisiones y alcance en [`34-discord.md`](34-discord.md), sección 4. Resumen: entrar
con Discord, que el rol del servidor sea el permiso en Pulso, y ver el estado de la operación en una
pantalla.

- **Ojo:** es herramienta interna. Vale su costo solo si ahorra más tiempo del que consume — y en
  plena emergencia ese cálculo no es obvio. Alcance mínimo primero.
- **Depende de:** que exista la aplicación de Discord y su secreto. Lo crea el Maintainer.

### `PL-4` · Sincronizar tickets entre GitHub y Discord · **M** · Backend + DevOps

El bot descrito en [`34-discord.md`](34-discord.md), sección 3. Se hace **después** de que el flujo
manual con webhooks lleve una semana funcionando: si el flujo manual no se usa, automatizarlo no lo
va a arreglar.

---

## Largo plazo — uno a tres meses

### `PL-5` · Interoperabilidad institucional · **L** · Backend + Data

Exportar a los formatos que la UNGRD, las alcaldías y los organismos de socorro ya usan. Ninguna
entidad va a adoptar un formato nuevo en emergencia; el que se adapta es Pulso.

- **Depende de:** [`35-alianzas.md`](35-alianzas.md) — primero hay que saber qué formato pide cada
  quien, y eso se pregunta, no se adivina.

### `PL-6` · Anclaje de integridad más allá de Devnet · **L** · Blockchain

El programa `pulso_anchor` está escrito y probado en local. Falta Devnet estable, el relayer, y el
verificador público de manifiestos. Ver [`23-solana-anchor-program.md`](23-solana-anchor-program.md).

- **Ojo:** la disponibilidad manda. Una caída de Solana, del RPC o del relayer **nunca** puede
  bloquear un registro de emergencia. Si tu diseño lo hace, el diseño está mal.

### `PL-7` · Despliegue para otra emergencia · **L** · Backend + DevOps

Que Pulso se levante para otro desastre en otro país sin reescribirlo: incidente, territorios y
fuentes como configuración, no como código.

- **Acepta cuando:** existe un procedimiento escrito que alguien que no construyó esto pueda seguir.

### `PL-8` · Modelo de amenazas y respaldos probados · **M** · DevOps + Maintainer

Están como puerta de producción en [`07-roadmap.md`](07-roadmap.md) y siguen sin cerrar. Un respaldo
que nunca se restauró no es un respaldo.

- **Acepta cuando:** hay una restauración hecha de verdad, cronometrada y anotada.

---

## Deuda conocida

No son tickets todavía. Están aquí para que nadie los redescubra y crea que encontró algo nuevo.

| Qué | Por qué duele | Rol |
| --- | --- | --- |
| `README.md` estaba desactualizado (marca vieja, «datos sintéticos», 13 migraciones cuando hay 24) | Es lo primero que lee quien llega | Corregido en esta tanda |
| El worker corre por `cron`, sin panel de estado | Una ingesta que falla se descubre tarde | DevOps |
| No hay pruebas de extremo a extremo del flujo de reporte | Lo más usado del sitio es lo menos probado | Frontend |
| Sin límite de tasa en las rutas públicas de lectura | El día que nos enlacen desde un medio grande, se cae | DevOps |
| Copernicus sin decidir | Puede que estemos por duplicar el trabajo de otro equipo | Data |
| ~~677 necesidades con una dirección por título~~ | Corregido el 16/08: el título sale de lo que se pidió y la dirección va a `metadata.address`. Quedan 33, que son personas que escribieron su dirección en el campo de qué necesitan | Hecho |
| 84 centros de Ayudas Pereira sin coordenada | No se pintan en el mapa. Tienen dirección en texto, pero geocodificar mal manda un equipo al sitio equivocado | Data |
