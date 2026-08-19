INSERT INTO project_capabilities (id, priority, name, status, note, task_code, updated_at)
SELECT gen_random_uuid(), 'P1', 'Enlazar donación con entrega real', 'listo',
  'Publicado el 18/08. La cadena llega hasta la puerta: qué hogar recibió qué, de qué contrato o '
  || 'donación salió, y cómo se sabe que llegó. Cuatro estados y el que importa es **rechazada**: '
  || 'el hogar entra en pulso.my/mi-registro con su código y puede decir que NO le llegó. Es la '
  || 'única señal del sistema que no puede venir de quien tiene interés en que la cifra suba. La '
  || 'cobertura pública cuenta las desmentidas junto a las confirmadas.',
  NULL, now()
WHERE NOT EXISTS (SELECT 1 FROM project_capabilities WHERE priority='P1' AND name='Enlazar donación con entrega real');

INSERT INTO project_capabilities (id, priority, name, status, note, task_code, updated_at)
SELECT gen_random_uuid(), 'P1', 'Cumplimiento de la Ley 1581', 'parcial',
  'Contrastado artículo por artículo con el Decreto 1377 el 18/08. Hecho: política de tratamiento '
  || 'publicada en pulso.my/privacidad con los seis contenidos del art. 13; consentimiento '
  || 'versionado con prueba por fila; datos sensibles de salud con aviso de que responder es '
  || 'facultativo y CHECK que impide guardarlos sin autorización expresa (art. 6); finalidades '
  || 'separadas y un trigger que impide usar un dato para una finalidad no autorizada; retención de '
  || '90 días automática (art. 11); responsable del tratamiento versionado. **Falta la revisión de '
  || 'un abogado y decidir si hay que inscribir la base en el RNBD ante la SIC** — eso depende de '
  || 'la figura jurídica, que será una fundación todavía no constituida aquí.',
  NULL, now()
WHERE NOT EXISTS (SELECT 1 FROM project_capabilities WHERE priority='P1' AND name='Cumplimiento de la Ley 1581');

UPDATE project_tasks SET status='hecho', completed_at=now(),
  summary = coalesce(summary || ' ','') || '**HECHO el 18/08** por otra vía: en vez de una lista '
    || 'exportable, la entrega se registra hogar por hogar en Operaciones y la familia la confirma '
    || 'o la desmiente con su código. El agregado por municipio sale en '
    || '/v1/public/incidents/colombia-2026/aid-delivery-coverage.'
WHERE code='P1-6';

SELECT status, count(*) FROM project_tasks GROUP BY 1 ORDER BY 2 DESC;
