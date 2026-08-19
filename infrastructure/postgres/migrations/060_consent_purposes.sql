-- Blindaje legal del censo comunitario, contra el texto del Decreto 1377 de 2013.
--
-- **No es asesoría jurídica** — nadie aquí es abogado. Es la implementación contrastada artículo por
-- artículo con el decreto, para que quien sí lo sea revise algo concreto en vez de una idea.
--
-- ## El hallazgo que bloquea la fase siguiente
--
-- El texto de consentimiento de la versión 1 dice, literalmente, «con una **única** finalidad:
-- entregarle a la alcaldía... que mi hogar resultó afectado». La siguiente fase del proyecto es
-- enlazar las donaciones con la entrega real, es decir, **usar estos datos para hacerle llegar ayuda
-- a esas personas**.
--
-- Eso es otra finalidad. El principio de finalidad de la Ley 1581 no permite usar un dato para algo
-- distinto de lo que se informó, así que **los registros de la versión 1 no se pueden usar para
-- coordinar entregas**. No es una formalidad: es la diferencia entre pedirle los datos a una familia
-- para una cosa y usarlos para otra.
--
-- Se arregla con una versión nueva del texto y guardando **qué finalidades autorizó cada quien**. La
-- versión 1 no se toca ni se reinterpreta: las filas que apuntan a ella son la prueba de a qué
-- consintió esa gente, y reescribirla borraría esa prueba.

-- Qué autorizó cada persona, por finalidad. Un arreglo y no un booleano porque son independientes:
-- alguien puede querer aparecer en la lista que va a la alcaldía y **no** querer que una fundación
-- lo llame.
ALTER TABLE household_self_registrations
  ADD COLUMN consent_purposes text[] NOT NULL DEFAULT ARRAY['autoridad']::text[],
  ADD CONSTRAINT household_self_registrations_purposes_ck CHECK (
    consent_purposes <@ ARRAY['autoridad', 'entrega_ayuda']::text[]
    AND array_length(consent_purposes, 1) >= 1
  );

COMMENT ON COLUMN household_self_registrations.consent_purposes IS
  'Finalidades que la persona autorizó. `autoridad`: entregar a la alcaldía que su hogar resultó '
  'afectado. `entrega_ayuda`: que una organización pueda contactarla para hacerle llegar ayuda. '
  'Son independientes: usar un registro para una finalidad no autorizada viola el principio de '
  'finalidad de la Ley 1581, y el arreglo es lo que hace esa violación imposible por consulta.';

-- Y los datos sensibles, marcados como lo que son.
--
-- Discapacidad, embarazo y enfermedad crónica son **datos de salud**, y el artículo 5 de la Ley 1581
-- los clasifica como sensibles. El artículo 6 del Decreto 1377 exige tres cosas que no estábamos
-- cumpliendo: informar que **no está obligado a autorizar** su tratamiento, decir explícitamente
-- cuáles son sensibles, y no condicionar ninguna actividad a que los entregue.
--
-- La tercera ya se cumplía —están en el bloque opcional— pero las dos primeras no se decían en
-- ninguna parte. Esta columna guarda si la persona autorizó **expresamente** ese tratamiento; sin
-- ella, los campos de salud no se pueden usar aunque estén llenos.
ALTER TABLE household_self_registrations
  ADD COLUMN sensitive_data_authorized boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN household_self_registrations.sensitive_data_authorized IS
  'Si autorizó expresamente el tratamiento de datos de salud (discapacidad, embarazo, enfermedad). '
  'Art. 6 del Decreto 1377: hay que informarle que NO está obligado, y ninguna actividad puede '
  'condicionarse a que los entregue.';

-- Invariante: no se pueden guardar datos de salud sin autorización expresa para ellos.
--
-- Va en la base y no en el formulario porque un formulario se cambia sin darse cuenta y una
-- restricción no. Es la misma razón por la que el borrado a petición es un CHECK.
ALTER TABLE household_self_registrations
  ADD CONSTRAINT household_self_registrations_sensitive_ck CHECK (
    sensitive_data_authorized
    OR (has_disability = false AND has_pregnancy = false AND has_chronic_illness = false)
  );

-- ## Versión 2 del texto
--
-- Cubre las dos finalidades por separado, dice cuáles datos son sensibles y que responderlos es
-- facultativo, y nombra el responsable y cómo ejercer los derechos — que es lo que exigen los
-- artículos 13 y 15 del decreto.
INSERT INTO consent_texts (id, slug, version, body) VALUES (
  gen_random_uuid(), 'censo-comunitario', 2,
  'Autorizo a Pulso a tratar los datos que entrego en este formulario para las finalidades que yo '
  || 'marque, y solo para esas: (1) entregarle a la alcaldía o a la autoridad de gestión del riesgo '
  || 'de mi municipio que mi hogar resultó afectado y, si es el caso, que todavía no nos ha censado '
  || 'nadie; y (2) si lo autorizo aparte, que una organización de ayuda pueda contactarme para '
  || 'hacerme llegar ayuda y dejar constancia de que la recibí. '
  || 'Las preguntas sobre discapacidad, embarazo o enfermedad son DATOS SENSIBLES de salud: NO '
  || 'estoy obligado a responderlas ni a autorizar su tratamiento, y no responderlas no me quita '
  || 'nada — el registro funciona igual sin ellas. '
  || 'Entiendo que Pulso no es una autoridad, que registrarme aquí NO me inscribe en ninguna ayuda '
  || 'y NO me da derecho a recibirla, y que el censo oficial se hace de forma presencial. '
  || 'Mi nombre, teléfono y documento se guardan cifrados y no se publican nunca. Puedo consultar, '
  || 'corregir o pedir el borrado de mis datos en cualquier momento con el código que se me entrega '
  || 'al terminar, sin dar explicaciones. Si no lo pido, se borran solos a los 90 días. '
  || 'Responsable del tratamiento: Pulso — pulso.my — vortexlabcol@gmail.com. '
  || 'La política completa está en pulso.my/privacidad. Ley 1581 de 2012 y Decreto 1377 de 2013.'
);

-- ## Y una vista que hace imposible el error
--
-- La fase de donaciones va a necesitar «los hogares a los que puedo contactar para entregar ayuda».
-- Si esa consulta se escribe a mano cada vez, algún día alguien olvidará el filtro de finalidad. Con
-- la vista, olvidarlo exige salirse de ella a propósito.
CREATE VIEW households_reachable_for_aid AS
SELECT r.*
FROM household_self_registrations r
WHERE r.redacted_at IS NULL
  AND r.status <> 'retirado'
  AND 'entrega_ayuda' = ANY (r.consent_purposes)
  AND r.contact_phone_encrypted IS NOT NULL;

COMMENT ON VIEW households_reachable_for_aid IS
  'Hogares que autorizaron expresamente ser contactados para recibir ayuda. La fase de donaciones '
  'consulta AQUÍ y no la tabla: el filtro de finalidad deja de depender de que alguien se acuerde.';
