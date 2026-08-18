-- "refugio" se renombra a "albergues" (mismo concepto, término que usan las fuentes reales) y se
-- suman tres categorías nuevas para separar lo que hoy se mezclaba dentro de "necesidad": censo
-- catastral, puntos de ayuda operativos y centros de acopio.
UPDATE community_reports SET category = 'albergues' WHERE category = 'refugio';

ALTER TABLE community_reports DROP CONSTRAINT community_reports_category_check;

ALTER TABLE community_reports
  ADD CONSTRAINT community_reports_category_check
  CHECK (category IS NULL OR category IN (
    'agua', 'alimentos', 'salud', 'albergues', 'higiene', 'herramienta',
    'escombros', 'voluntariado', 'animales', 'logistica',
    'catastros', 'puntos_ayuda', 'centros_acopio', 'otro'
  ));
