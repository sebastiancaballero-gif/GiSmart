-- Corrige public.get_json_conectividad_cubierta después de la recarga de
-- tab_fiber.puerto_equipo, que renombró las columnas del equipo al que
-- pertenece el puerto:
--
--   tab_fiber.puerto_equipo (alias «pe» en la función)
--     id_equipo   -> id_equipo_pert
--     tipo_equipo -> tipo_equipo_pert
--
-- Síntoma (14 de octubre de 2026): la función falla en las 185 cubiertas con
-- «42703 column pe.id_equipo does not exist», y «Conectividad fina» muestra ese
-- error en todas.
--
-- Ojo: tab_fiber.tarjeta_bandeja_eqp sigue llamando id_equipo y tipo_equipo a
-- sus columnas. Por eso solo se cambia lo que va con el alias «pe», y solo si
-- «pe» es puerto_equipo; si no lo es, el paso 2 no toca nada y avisa.
--
-- Solo cambian las columnas que se leen: las claves del JSON que devuelve
-- quedan igual, así que el esquemático de Dario no se entera. Se puede correr
-- más de una vez: lo que ya está corregido no se vuelve a tocar.
--
-- Correr en el editor SQL de Supabase, paso por paso.


-- PASO 0. Respaldo: la definición actual, para volver atrás si hiciera falta
-- (copiar el resultado y guardarlo; se restaura pegándolo y ejecutándolo).
select pg_get_functiondef('public.get_json_conectividad_cubierta(uuid)'::regprocedure);


-- PASO 1. Ver las líneas que usan el alias «pe» y con qué tabla se declara.
select n as linea, l as texto
from unnest(string_to_array(
       pg_get_functiondef('public.get_json_conectividad_cubierta(uuid)'::regprocedure), E'\n'
     )) with ordinality as t(l, n)
where l ~ '\mpe\.' or l ~* '\mpuerto_equipo\M';


-- PASO 2. Reescribir la función con los nombres nuevos. Toma la definición
-- actual, cambia solo esas columnas y la vuelve a crear. CREATE OR REPLACE
-- conserva los permisos que ya tenía.
do $$
declare
  definicion text := pg_get_functiondef('public.get_json_conectividad_cubierta(uuid)'::regprocedure);
  nueva text;
begin
  if definicion !~* 'puerto_equipo\s+(as\s+)?pe\M' then
    raise exception 'En la función, «pe» no se declara como puerto_equipo. No se cambió nada: revisar el resultado del paso 1.';
  end if;
  -- \M exige fin de palabra: pe.id_equipo_pert no vuelve a cambiar.
  nueva := regexp_replace(definicion, '\mpe\.id_equipo\M',   'pe.id_equipo_pert',   'g');
  nueva := regexp_replace(nueva,      '\mpe\.tipo_equipo\M', 'pe.tipo_equipo_pert', 'g');
  if nueva = definicion then
    raise notice 'No había nada que cambiar: la función ya usa los nombres nuevos.';
  else
    execute nueva;
    raise notice 'Función actualizada.';
  end if;
end $$;


-- PASO 3. Probar con una cubierta que existe hoy (CO13). Debe devolver un JSON,
-- no un error. Si sale otro «column ... does not exist», es otra columna que
-- también cambió de nombre: corregirla igual que arriba.
select public.get_json_conectividad_cubierta(
  (select id from geo_fiber.cubierta_empalme where etiqueta = 'CO13' limit 1)
);
