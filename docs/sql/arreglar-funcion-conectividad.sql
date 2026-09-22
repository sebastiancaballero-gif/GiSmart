-- Corrige public.get_json_conectividad_cubierta después de las recargas de
-- tablas, que renombraron columnas que la función lee:
--
--   geo_fiber.cubierta_empalme (alias «c» en la función)
--     modelo_div        -> modelo_divisor
--     can_div           -> cant_div
--     tip_conect_roseta -> tipo_conect_roseta
--     fecha_creacion    -> creado_en
--     fecha_ult_act     -> modificado_en
--     actualizado_por   -> modificado_por
--
--   tab_fiber.hilo_cable (alias «h» en la función)
--     color             -> color_hilo   (y se agregó color_buffer)
--
-- Síntoma: la función falla en todas las mufas con «42703 column c.modelo_div
-- does not exist» o «42703 column h.color does not exist».
--
-- Solo cambian las columnas que se leen: las claves del JSON que devuelve
-- quedan igual, así que el esquemático de Dario no se entera. Se puede correr
-- más de una vez: lo que ya está corregido no se vuelve a tocar.
--
-- Correr en el editor SQL de Supabase, en tres pasos.


-- PASO 1. Ver qué líneas de la función usan los nombres viejos, y con qué
-- alias aparecen cubierta_empalme e hilo_cable. El paso 2 supone que son «c»
-- y «h»; si son otros, cambiarlos en el paso 2 por los alias reales.
select n as linea, l as texto
from unnest(string_to_array(
       pg_get_functiondef('public.get_json_conectividad_cubierta(uuid)'::regprocedure), E'\n'
     )) with ordinality as t(l, n)
where l ~ '\m(modelo_div|can_div|tip_conect_roseta|fecha_creacion|fecha_ult_act|actualizado_por|color)\M'
   or l ~* '\m(cubierta_empalme|hilo_cable)\M';


-- PASO 2. Reescribir la función con los nombres nuevos. Toma la definición
-- actual, cambia solo esas columnas y la vuelve a crear. CREATE OR REPLACE
-- conserva los permisos que ya tenía.
do $$
declare
  definicion text := pg_get_functiondef('public.get_json_conectividad_cubierta(uuid)'::regprocedure);
begin
  -- cubierta_empalme
  definicion := regexp_replace(definicion, '\mc\.modelo_div\M',        'c.modelo_divisor',     'g');
  definicion := regexp_replace(definicion, '\mc\.can_div\M',           'c.cant_div',           'g');
  definicion := regexp_replace(definicion, '\mc\.tip_conect_roseta\M', 'c.tipo_conect_roseta', 'g');
  definicion := regexp_replace(definicion, '\mc\.fecha_creacion\M',    'c.creado_en',          'g');
  definicion := regexp_replace(definicion, '\mc\.fecha_ult_act\M',     'c.modificado_en',      'g');
  definicion := regexp_replace(definicion, '\mc\.actualizado_por\M',   'c.modificado_por',     'g');
  -- hilo_cable
  definicion := regexp_replace(definicion, '\mh\.color\M',             'h.color_hilo',         'g');
  execute definicion;
end $$;


-- PASO 3. Probar con una mufa que existe hoy (1/2). Debe devolver un JSON,
-- no un error. Si sale otro «column ... does not exist», es una columna de
-- otra tabla que también cambió de nombre: corregirla igual que arriba.
select public.get_json_conectividad_cubierta('01a0c59c-fd8c-7173-ac10-1e8d4521100e');
