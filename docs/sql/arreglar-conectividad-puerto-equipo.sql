-- Corrige public.get_json_conectividad_cubierta después de la recarga de
-- tab_fiber.puerto_equipo, que cambió los nombres de sus columnas:
--
--   tab_fiber.puerto_equipo (alias «pe» en la función)
--     id_equipo   -> id_equipo_pert         (ya corregida por Carlos)
--     tipo_equipo -> tipo_equipo_pert
--     tipo_puerto -> dir_principal_senhal   (E = entrada, S = salida, B = bandeja)
--
-- Síntoma (14 de octubre de 2026): «Conectividad fina» falla en las 185
-- cubiertas, primero con «42703 column pe.id_equipo does not exist» y, ya
-- corregida esa, con «42703 column pe.tipo_puerto does not exist».
--
-- tab_fiber.tarjeta_bandeja_eqp sigue llamando id_equipo y tipo_equipo a sus
-- columnas: por eso solo se cambia lo que va con el alias «pe», y solo si «pe»
-- es puerto_equipo. Las claves del JSON que devuelve la función quedan igual,
-- así que el esquemático de Dario no se entera.
--
-- Se corre en el editor SQL de Supabase, un paso a la vez (seleccionar el paso
-- y ejecutar). Se puede correr más de una vez.


-- PASO 0. Respaldo. Copiar el resultado y guardarlo: para volver atrás basta
-- pegarlo en el editor y ejecutarlo.
select pg_get_functiondef('public.get_json_conectividad_cubierta(uuid)'::regprocedure);


-- PASO 1. Diagnóstico (solo lee). Las columnas que la función nombra y que no
-- existen en ninguna tabla, con la línea donde aparecen. La base solo avisa de
-- la primera que falla; esto las muestra todas. Puede listar alguna de más
-- (un nombre que la propia función calcula en una subconsulta).
with def as (
  select pg_get_functiondef('public.get_json_conectividad_cubierta(uuid)'::regprocedure) as d
),
lineas as (
  select n, l from def, unnest(string_to_array(d, E'\n')) with ordinality as t(l, n)
),
faltan as (
  select distinct m[1] as alias, m[2] as columna
  from def, regexp_matches(d, '\m([a-z_][a-z0-9_]*)\.([a-z_][a-z0-9_]*)\M', 'g') as m
  where m[1] not in ('public', 'tab_fiber', 'geo_fiber', 'geo_infra', 'pg_catalog')
    and m[2] not in (select column_name from information_schema.columns)
)
select f.alias || '.' || f.columna as columna_que_falta, l.n as linea, trim(l.l) as texto
from faltan f
join lineas l on l.l ~ ('\m' || f.alias || '\.' || f.columna || '\M')
order by l.n;


-- PASO 2. Corregir y probar. Cambia esas columnas, vuelve a crear la función
-- (CREATE OR REPLACE conserva sus permisos) y la prueba con TODAS las
-- cubiertas. Si alguna sigue fallando, no se guarda nada: el error dice
-- cuántas fallan y el mensaje de la primera (mandárselo a quien la revise).
do $$
declare
  definicion text := pg_get_functiondef('public.get_json_conectividad_cubierta(uuid)'::regprocedure);
  nueva text;
  cub record;
  bien int := 0;
  mal int := 0;
  primer_error text;
begin
  if definicion !~* 'puerto_equipo\s+(as\s+)?pe\M' then
    raise exception 'En la función, «pe» no se declara como puerto_equipo. No se cambió nada: revisar el paso 1.';
  end if;

  -- \M exige fin de palabra: lo ya corregido (pe.id_equipo_pert) no vuelve a cambiar.
  nueva := regexp_replace(definicion, '\mpe\.id_equipo\M',   'pe.id_equipo_pert',      'g');
  nueva := regexp_replace(nueva,      '\mpe\.tipo_equipo\M', 'pe.tipo_equipo_pert',    'g');
  nueva := regexp_replace(nueva,      '\mpe\.tipo_puerto\M', 'pe.dir_principal_senhal', 'g');
  if nueva <> definicion then
    execute nueva;
  end if;

  for cub in select id, etiqueta from geo_fiber.cubierta_empalme loop
    begin
      perform public.get_json_conectividad_cubierta(cub.id);
      bien := bien + 1;
    exception when others then
      mal := mal + 1;
      if primer_error is null then
        primer_error := coalesce(cub.etiqueta, cub.id::text) || ': ' || sqlstate || ' ' || sqlerrm;
      end if;
    end;
  end loop;

  if mal > 0 then
    -- La excepción deshace el CREATE OR REPLACE de arriba: la función queda como estaba.
    raise exception 'No se guardó nada: % de % cubiertas siguen fallando. Primer error: %', mal, bien + mal, primer_error;
  end if;
  raise notice 'Función corregida: las % cubiertas responden.', bien;
end $$;


-- PASO 3. Comprobar con una cubierta (CO19). Debe devolver un JSON, no un error.
select public.get_json_conectividad_cubierta(
  (select id from geo_fiber.cubierta_empalme where etiqueta = 'CO19' limit 1)
);
