-- P1-5 hecho.
--
-- El número 070 queda libre a propósito: lo ocupa la migración de categorías que viene de la rama
-- de frontend, ya escrita y verificada en `integracion/develop`. Saltarlo aquí evita repetir el
-- choque de números que esa rama traía.
UPDATE project_tasks
SET status = 'hecho',
    completed_at = now(),
    updated_at = now(),
    summary = coalesce(summary || ' ', '')
      || E'\n\n**HECHO el 19/08.** 1.627 edificaciones señaladas desde satélite, en el mapa y '
      || 'distinguibles sin abrir nada: un reporte de una persona es un círculo lleno con un '
      || 'glifo; una detección de un sensor es un **cuadrado hueco**, continuo si lo marcó un '
      || 'analista y punteado si lo señaló un modelo. Forma y no color, así que se lee también sin '
      || 'ver color. Capa apagada por defecto y dibujada en los dos mapas —el SVG de país y el '
      || 'Leaflet de departamento—, con la fecha de la imagen y «nadie lo ha verificado en el '
      || 'terreno» en cada rótulo.'
      || E'\n\n**El ticket se quedó corto en dos cosas.** Decía que solo había Cali y Pereira: '
      || 'UNOSAT publicó además Anserma, Manizales y Viterbo, con analista humano sobre imagen '
      || 'Pleiades. Y decía que esto sumaba verificación cruzada y no cobertura nueva — **en '
      || 'Viterbo hay 3 reportes ciudadanos y 154 edificaciones señaladas; en Anserma, 6 y 104**. '
      || 'Eso es lo que nadie había contado.'
      || E'\n\n**Se ingiere también el área analizada**, que no estaba pedida. Sin ella el mapa '
      || 'miente por omisión: UNOSAT resume San José del Palmar diciendo que no observó daño '
      || 'generalizado *dentro de las áreas sin nubes*, y el Chocó casi siempre está nublado. Un '
      || 'punto solitario sin el área alrededor se leería como «solo se dañó esto».'
      || E'\n\n**Licencia:** CC BY (Microsoft) y CC BY-SA (UNOSAT), como columnas NOT NULL con '
      || 'CHECK — una fila sin atribución no entra— y devueltas dentro de la propia respuesta de '
      || '`/v1/public/incidents/colombia-2026/remote-damage`.'
WHERE code = 'P1-5' AND status <> 'hecho';

INSERT INTO project_capabilities (id, priority, name, status, note, task_code, updated_at)
SELECT gen_random_uuid(), 'P1', 'Daño visto desde satélite', 'listo',
  '1.627 edificaciones de UNOSAT (Anserma, Manizales, Viterbo — analista humano) y Microsoft AI '
  || 'for Good Lab (Cali, Pereira — modelo), con su área analizada y su licencia. Ninguna está '
  || 'verificada en terreno todavía, y el mapa lo dice en cada rótulo.',
  'P1-5', now()
WHERE NOT EXISTS (
  SELECT 1 FROM project_capabilities WHERE priority='P1' AND name='Daño visto desde satélite'
);

SELECT status, count(*) FROM project_tasks GROUP BY 1 ORDER BY 2 DESC;
