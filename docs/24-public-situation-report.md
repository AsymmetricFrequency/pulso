# Informe público territorial

## Objetivo

La portada de `pulso.my` es el informe público de la emergencia. Debe permitir que comunidades, donantes, medios, organizaciones y autoridades respondan cinco preguntas sin iniciar sesión:

1. ¿Qué territorios fueron cubiertos y cuáles continúan sin verificar?
2. ¿Qué daños están reportados, corroborados o validados?
3. ¿Qué insumos se necesitan, están en tránsito o fueron entregados?
4. ¿Qué ocurrió con cada donación monetaria o en especie?
5. ¿Qué equipos están desplegados y qué trabajo completaron?

La primera interfaz y el contrato de API están implementados con datos sintéticos. No debe presentarse como información real hasta conectar fuentes verificadas y activar el flujo editorial.

El endpoint público actual es:

`GET /v1/public/incidents/:incidentCode/report`

La respuesta declara `dataMode: demo | live`, versión de esquema, fecha de corte, publicación, métricas, territorios, actualizaciones, balances de ayuda e integridad. Se entrega con caché pública y nunca contiene campos de identidad personal.

## Jerarquía territorial

El modelo público navega esta jerarquía:

`país → departamento → municipio/distrito → ciudad/localidad/corregimiento → zona operativa`

El expediente interno puede conservar geometrías y ubicaciones más precisas. La vista pública agrega o desplaza la información cuando publicar el punto exacto pueda identificar una vivienda, persona, albergue sensible o inventario vulnerable.

Cada agregado público incluye:

- código territorial oficial y versión de la geometría;
- periodo observado y momento de última actualización;
- cantidad de registros que sustentan la cifra;
- nivel de confianza y estado de validación;
- cobertura conocida y brecha de cobertura;
- fuente institucional o categoría de actor, sin exponer a la persona;
- enlace a evidencia pública redactada cuando corresponda.

## Capas del mapa

### Cobertura

Zonas sin verificar, asignadas, visitadas parcialmente, visitadas o con acceso restringido. Una ausencia de reportes no se interpreta como ausencia de daños.

### Daños

Vivienda, infraestructura, vías, servicios, salud, educación, medios de vida y animales. La severidad pública se calcula solo con metodologías versionadas y muestra cuántos casos siguen pendientes de inspección profesional.

### Insumos

Necesidad solicitada, validada, comprometida, recibida, disponible, asignada, en tránsito, entregada, rechazada o perdida. El mapa destaca brechas, no solo cantidades entregadas.

### Donaciones

Valor o cantidad registrada, conciliada, asignada y entregada. Dinero y especie se informan por separado; una valoración monetaria estimada nunca sustituye la cantidad física.

### Equipos

Equipos programados, desplegados, activos o con misión completada. Públicamente se muestra organización, capacidad agregada, especialidad y estado; no rutas en tiempo real ni datos personales.

## Materiales de construcción

Cada material utiliza un catálogo canónico con unidad base. Por ejemplo:

| Material | Unidad pública | Datos internos mínimos |
|---|---|---|
| Cemento | saco de peso declarado | cantidad, kg por saco, lote, vencimiento y estado |
| Arena y grava | m³ | volumen medido, tolerancia y origen |
| Bloque o ladrillo | unidad | tipo, dimensiones, resistencia y cantidad aceptada |
| Acero | kg o varilla especificada | diámetro, longitud, grado y peso |
| Lámina de cubierta | unidad y m² | material, calibre, longitud y estado |
| Madera | m³ o pieza especificada | especie, sección, longitud, tratamiento y estado |

No se suman unidades incompatibles. Una donación genera movimientos append-only: promesa, recepción, inspección, aceptación o rechazo, almacenamiento, asignación, despacho, entrega, devolución, pérdida o ajuste justificado.

El balance se calcula por material y territorio:

`brecha = necesidad validada - cantidad entregada utilizable - cantidad en tránsito confirmada`

La evidencia de entrega incluye cantidad, unidad, momento, zona de destino, actor responsable y confirmación del receptor. Los datos personales del receptor permanecen fuera de la vista pública.

## Estados de confianza

1. **Reportado:** existe un registro con autor, tiempo y territorio.
2. **Corroborado:** una segunda fuente independiente coincide con el hecho.
3. **Validado:** un actor autorizado confirma el dato dentro de su competencia.
4. **Publicado:** una regla editorial y de privacidad permite mostrar el agregado.
5. **Anclado:** la huella del lote publicado queda registrada en Solana.

Blockchain prueba que un lote no fue alterado después de publicarse; no prueba por sí sola que el dato original sea verdadero. La confianza proviene de identidad, competencia, evidencia, corroboración y auditoría.

## Flujo técnico

1. Campo registra offline y sincroniza cuando encuentra conexión.
2. La API deduplica, conserva versiones y relaciona evidencia.
3. Validadores revisan conflictos, actores y calidad.
4. Un servicio de publicación aplica privacidad, umbrales y agregación territorial.
5. Vistas de lectura generan el informe público y sus cortes históricos.
6. El relayer agrupa eventos publicados, calcula la raíz Merkle y la ancla en Solana.

La landing nunca consulta directamente tablas operacionales sensibles. Consume una API pública de solo lectura, limitada y cacheable. Si el servicio no está disponible, la interfaz puede conservar un corte público firmado previamente; no retrocede a tablas privadas.

## Protección contra fraude y duplicidad

- identificadores idempotentes por captura y movimiento;
- similitud de tiempo, ubicación, activo, receptor y evidencia;
- hash perceptual de fotografías y hash criptográfico del archivo original;
- separación entre reportar, validar, asignar y confirmar entrega;
- doble confirmación en entregas de alto valor;
- inventario de doble entrada y conciliación física;
- historial de correcciones, sin sobrescritura silenciosa;
- alertas por cantidades imposibles, velocidad atípica o concentración por actor;
- derecho a disputa y revisión humana.

## Trabajo pendiente priorizado

### P0 — informe real

- incorporar geometrías oficiales de municipios, distritos y zonas operativas;
- crear las vistas agregadas que alimentarán la API pública de solo lectura ya implementada;
- conectar reportes, evaluaciones, necesidades, inventario, entregas y equipos reales;
- implementar flujo editorial `borrador → revisado → publicado → corregido`;
- definir umbral mínimo de privacidad y reglas de desplazamiento geográfico;
- mostrar fuente, metodología, cobertura y frescura en cada métrica;
- permitir exportar CSV/JSON y descargar cortes firmados.

### P0 — donaciones e inventario

- catálogo canónico de materiales y conversiones controladas;
- recepción e inspección con tolerancias y rechazo parcial;
- libro de movimientos append-only y conciliación por bodega;
- asignación contra necesidad validada;
- comprobante de entrega y manejo de devoluciones o pérdidas.

### P1 — integridad pública

- relayer idempotente y manifiestos Merkle;
- despliegue de `pulso_anchor` en Devnet;
- página pública para verificar un corte contra Solana;
- historial temporal por territorio y comparación entre cortes.

### P1 — operación y calidad

- monitoreo de frescura, anomalías y zonas silenciosas;
- pruebas de carga, accesibilidad, dispositivos de gama baja y conexiones lentas;
- revisión jurídica, seguridad y simulacro completo con actores reales.
