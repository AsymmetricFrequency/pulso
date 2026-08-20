-- P1-3 hecho, y con el alcance dicho sin adornos.
--
-- El ticket dependía de P1-1 y describía el modelo de la migración 012 (`affected_people`,
-- `disaster_cases`). **Eso sigue sin existir**, así que la bandeja se construyó sobre el censo que
-- sí está en producción: `household_self_registrations`. No es un atajo — es que deduplicar el
-- padrón que hoy alimenta la lista que se le entrega a una alcaldía vale más que deduplicar un
-- modelo del que no hay ni una fila. Pero conviene que quede escrito: si mañana se retoma el modelo
-- de la 012, este emparejador **no lo cubre**.
UPDATE project_tasks
SET status = 'hecho',
    completed_at = now(),
    updated_at = now(),
    summary = coalesce(summary || ' ', '')
      || E'\n\n**HECHO el 20/08.** Bandeja en Operaciones: la plataforma propone pares con la '
      || 'señal que los emparejó y una persona confirma o descarta, firmando con un motivo de al '
      || 'menos diez caracteres. **Nada se fusiona ni se borra**: al confirmar, el registro que no '
      || 'se conserva queda marcado `duplicado` y sigue ahí con sus conteos, y quién se queda lo '
      || 'elige la persona, no la fecha — el registro más nuevo puede traer la foto del daño y el '
      || 'teléfono que sí contesta. No existe ninguna ruta de fusión, y la ausencia es la '
      || 'decisión: si existiera, alguien acabaría llamándola desde un trabajo nocturno.'
      || E'\n\n**Alcance:** empareja `household_self_registrations`, no el modelo de la migración '
      || '012 del que depende este ticket. Ese modelo sigue sin una sola fila y sin un endpoint.'
      || E'\n\n**Lo que hubo que arreglar antes de poder emparejar nada.** La señal más fuerte —el '
      || 'mismo documento— no se podía observar: un índice único rechazaba el segundo registro en '
      || 'el INSERT. Devolvía **un 500 a una familia que solo intentaba registrarse**, y era '
      || 'fusión automática disfrazada de restricción — el sistema decidía solo que dos registros '
      || 'eran el mismo hogar. Podía equivocarse: quien registra su hogar y después el de su madre '
      || 'sin documento, con su propia cédula, veía desaparecer el segundo. El índice dejó de ser '
      || 'único y la colisión entra a la bandeja.'
      || E'\n\n**Señales, sin puntaje.** `fuerte` = mismo documento o mismo teléfono; `media` = '
      || 'mismo barrio (normalizado), mismo tamaño de hogar y además mismo punto o misma '
      || 'conexión. Un número entre 0 y 1 sería inventado: no hay duplicados etiquetados de este '
      || 'terremoto con qué calibrarlo. **Ni la ubicación ni la conexión hacen un candidato**, '
      || 'juntas o por separado: en un albergue veinte familias comparten el punto y el wifi, y si '
      || 'eso bastara la bandeja se llenaría de parejas falsas justo donde más gente hay.'
      || E'\n\n**Huella HMAC del teléfono**, para descubrir que dos registros comparten número sin '
      || 'descifrar ninguno de los dos. Sin índice único: dos vecinos pueden compartir el único '
      || 'teléfono de la cuadra, y eso es un candidato, no un motivo para negarle el registro a '
      || 'nadie.'
      || E'\n\n**La retención se pausa mientras haya un par abierto** —resolverlo suele ser llamar '
      || 'a los dos teléfonos— **con tope de treinta días**. El tope es lo importante: una pausa '
      || 'sin límite convierte una bandeja desatendida en retención indefinida, y bastaría con que '
      || 'nadie la abra para que esos datos se queden para siempre sin que ninguna decisión lo '
      || 'haya justificado.'
WHERE code = 'P1-3' AND status <> 'hecho';

INSERT INTO project_capabilities (id, priority, name, status, note, task_code, updated_at)
SELECT gen_random_uuid(), 'P1', 'Resolver hogares repetidos', 'listo',
  'La plataforma propone pares del censo comunitario con la señal que los emparejó y una persona '
  || 'los resuelve firmando. No fusiona nada: el registro descartado se marca y se conserva. No '
  || 'cubre el modelo de la migración 012, que sigue sin usarse.',
  'P1-3', now()
WHERE NOT EXISTS (
  SELECT 1 FROM project_capabilities WHERE priority='P1' AND name='Resolver hogares repetidos'
);

SELECT status, count(*) FROM project_tasks GROUP BY 1 ORDER BY 2 DESC;
