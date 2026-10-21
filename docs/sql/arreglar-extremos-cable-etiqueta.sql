-- Corrige geo_fiber.fn_json_extremos_cable (el botón «Cable» de Consultas)
-- después de que geo_fiber.cubierta_empalme se recreara el 20 de octubre de
-- 2026 y su columna «etiqueta» pasara a llamarse «salidas_div1» (con los
-- mismos valores: CO13, 17/18, 9-oct…).
--
-- Síntoma: el botón «Cable» falla en todos los cables con
--   42703 column cub.etiqueta does not exist
--   (hint: Perhaps you meant to reference the column "cab.etiqueta")
--
-- Solo se cambia lo que va con un alias de cubierta_empalme («cub»…):
-- geo_infra.cabecera_central («cab») sigue teniendo su «etiqueta» y no se
-- toca. Las claves del JSON que devuelve la función quedan igual.
--
-- Se corre en el editor SQL de Supabase, un paso a la vez (seleccionar el paso
-- y ejecutar). Se puede correr más de una vez: si ya está corregida, el paso 2
-- solo la vuelve a probar.


-- PASO 0. Respaldo. Copiar el resultado y guardarlo: para volver atrás basta
-- pegarlo en el editor y ejecutarlo.
select pg_get_functiondef('geo_fiber.fn_json_extremos_cable(uuid)'::regprocedure);


-- PASO 1. Diagnóstico (solo lee). Cada «alias.columna» de la función cuyo
-- alias es de una tabla (esquema.tabla alias) y cuya columna no está en esa
-- tabla, con la línea donde aparece. Hoy debería salir solo cub.etiqueta.
with def as (
  select pg_get_functiondef('geo_fiber.fn_json_extremos_cable(uuid)'::regprocedure) as d
),
lineas as (
  select n, l from def, unnest(string_to_array(d, E'\n')) with ordinality as t(l, n)
),
alias as (
  select distinct lower(m[3]) as alias, lower(m[1]) as esquema, lower(m[2]) as tabla
  from def, regexp_matches(d, '\m(tab_fiber|geo_fiber|geo_infra|public)\.([a-z_][a-z0-9_]*)\s+(?:as\s+)?([a-z_][a-z0-9_]*)\M', 'gi') as m
  where lower(m[3]) not in ('on', 'where', 'join', 'left', 'right', 'inner', 'full', 'cross', 'group', 'order',
                            'limit', 'and', 'or', 'union', 'lateral', 'as', 'using', 'returns', 'language', 'set')
),
usos as (
  select distinct lower(m[1]) as alias, lower(m[2]) as columna
  from def, regexp_matches(d, '\m([a-z_][a-z0-9_]*)\.([a-z_][a-z0-9_]*)\M', 'gi') as m
),
faltan as (
  select distinct u.alias, u.columna, a.esquema || '.' || a.tabla as tabla
  from usos u join alias a using (alias)
  where not exists (select 1 from information_schema.columns c
                    where c.table_schema = a.esquema and c.table_name = a.tabla and c.column_name = u.columna)
)
select f.alias || '.' || f.columna as columna_que_falta, f.tabla, l.n as linea, trim(l.l) as texto
from faltan f
join lineas l on l.l ~* ('\m' || f.alias || '\.' || f.columna || '\M')
order by l.n;


-- PASO 2. Corregir y probar. Cambia «alias.etiqueta» por «alias.salidas_div1»
-- en los alias de cubierta_empalme, vuelve a crear la función (CREATE OR
-- REPLACE conserva sus permisos) y la prueba con TODOS los cables. Si alguno
-- sigue fallando, no se guarda nada: el error dice cuántos fallan, el mensaje
-- del primero y las columnas que siguen sin existir en su tabla (mandárselo a
-- quien la revise).
do $$
declare
  definicion text := pg_get_functiondef('geo_fiber.fn_json_extremos_cable(uuid)'::regprocedure);
  nueva text := definicion;
  a text;
  cable record;
  bien int := 0;
  mal int := 0;
  primer_error text;
  faltan text;
  no_alias text[] := array['on', 'where', 'join', 'left', 'right', 'inner', 'full', 'cross', 'group', 'order',
                           'limit', 'and', 'or', 'union', 'lateral', 'as', 'using', 'returns', 'language', 'set'];
begin
  -- Todos los alias con que la función nombra a cubierta_empalme. \M exige fin
  -- de palabra: lo ya corregido no vuelve a cambiar.
  for a in select distinct lower(m[1])
           from regexp_matches(nueva, 'cubierta_empalme\s+(?:as\s+)?([a-z_][a-z0-9_]*)\M', 'gi') as m
           where lower(m[1]) <> all (no_alias) loop
    nueva := regexp_replace(nueva, '\m' || a || '\.etiqueta\M', a || '.salidas_div1', 'gi');
  end loop;
  -- Y si la nombra sin alias.
  nueva := regexp_replace(nueva, '\mcubierta_empalme\.etiqueta\M', 'cubierta_empalme.salidas_div1', 'gi');

  if nueva <> definicion then
    execute nueva;
    raise notice 'Función corregida: etiqueta -> salidas_div1 en los alias de cubierta_empalme.';
  else
    raise notice 'No había nada que cambiar; se vuelve a probar.';
  end if;

  for cable in select id from geo_fiber.cable_fibra loop
    begin
      perform geo_fiber.fn_json_extremos_cable(cable.id);
      bien := bien + 1;
    exception when others then
      mal := mal + 1;
      primer_error := coalesce(primer_error, cable.id::text || ': ' || sqlstate || ' ' || sqlerrm);
    end;
  end loop;

  if mal > 0 then
    -- Las columnas que siguen faltando, para el mensaje.
    with def as (select pg_get_functiondef('geo_fiber.fn_json_extremos_cable(uuid)'::regprocedure) as d),
    alias as (
      select distinct lower(m[3]) as alias, lower(m[1]) as esquema, lower(m[2]) as tabla
      from def, regexp_matches(d, '\m(tab_fiber|geo_fiber|geo_infra|public)\.([a-z_][a-z0-9_]*)\s+(?:as\s+)?([a-z_][a-z0-9_]*)\M', 'gi') as m
      where lower(m[3]) <> all (no_alias)
    ),
    usos as (
      select distinct lower(m[1]) as alias, lower(m[2]) as columna
      from def, regexp_matches(d, '\m([a-z_][a-z0-9_]*)\.([a-z_][a-z0-9_]*)\M', 'gi') as m
    )
    select string_agg(distinct u.alias || '.' || u.columna || ' (' || a.esquema || '.' || a.tabla || ')', ', ')
    into faltan
    from usos u join alias a using (alias)
    where not exists (select 1 from information_schema.columns c
                      where c.table_schema = a.esquema and c.table_name = a.tabla and c.column_name = u.columna);
    raise exception 'No se guardó nada: % de % cables siguen fallando. Primero: %. Columnas que no existen: %',
      mal, bien + mal, primer_error, coalesce(faltan, 'ninguna (el error es otro)');
  end if;

  raise notice 'Listo: la función responde en los % cables.', bien;
end
$$;


-- PASO 3. Comprobar a mano con un cable (2100555): debe devolver sus dos extremos.
select geo_fiber.fn_json_extremos_cable(id)
from geo_fiber.cable_fibra
where codigo = '2100555';
