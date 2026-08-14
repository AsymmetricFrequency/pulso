# Confianza, fraude y privacidad

## Actores

- Ciudadano: origina reportes.
- Brigadista: levanta evidencia de campo.
- Coordinador: asigna zonas y revisa operaciones.
- Profesional: certifica dentro de su especialidad.
- Organización: responde por equipos y permisos.
- Auditor: examina decisiones y trazabilidad.
- Administrador de emergencia: configura el incidente.

## Señales de duplicidad

- Proximidad geográfica.
- Identificadores personales transformados en hashes seguros.
- Integrantes del hogar coincidentes.
- Direcciones normalizadas.
- SHA-256 de archivos idénticos.
- Hash perceptual de fotografías similares.
- Dispositivo, actor y patrón temporal.
- Historial de ayudas.

El motor crea candidatos y explica señales. No fusiona hogares ni rechaza ayuda automáticamente.

## Evidencia

Los originales se almacenan cifrados. El worker valida tipo y tamaño, analiza malware, calcula hashes, genera miniaturas y extrae únicamente metadatos permitidos. El acceso se realiza mediante enlaces firmados de corta duración.

## Privacidad

Permisos por emergencia, organización, rol y territorio. Teléfono, documento, ubicación exacta y datos médicos se separan de la información operacional general. Las salidas públicas son agregadas y aplican umbrales para evitar reidentificación.

## Auditoría

Cada mutación relevante produce un evento con `beforeHash`, `afterHash` y `previousEventHash`. Una raíz periódica podrá anclarse externamente en una fase posterior sin publicar información personal.

## Controles sobre materiales

- Oferta, recepción, inspección, ajuste y entrega son funciones separadas.
- Lotes de riesgo mantienen procedencia, fabricante y documentos.
- Recepción registra instrumento o método de medición.
- Diferencias entre cantidad declarada, medida y aceptada se conservan.
- Entregas requieren confirmación en destino.
- Ajustes de alto impacto necesitan una segunda aprobación.
- Conteos físicos periódicos se concilian contra el libro de movimientos.
- Reglas detectan movimientos retroactivos, duplicados, rutas imposibles y pérdidas anómalas.
