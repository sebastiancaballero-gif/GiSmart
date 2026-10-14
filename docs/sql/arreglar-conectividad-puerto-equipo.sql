-- Corrige public.get_json_conectividad_cubierta después de la recarga de
-- tablas de octubre de 2026, que cambió nombres de columnas que la función lee:
--
--   tab_fiber.puerto_equipo (alias «pe», «pe_orig», «pe_dest»)
--     id_equipo   -> id_equipo_pert
--     tipo_equipo -> tipo_equipo_pert
--     tipo_puerto -> dir_principal_senhal
--   tab_fiber.divisor_optico (alias «d»…)
--     id_cubierta -> id_cubierta_ubica
--   tab_fiber.conectividad_fina (alias «cf»…)
--     id_ubicacion -> id_contenedor (+ tipo_contenedor)
--     *_origen     -> *_padre      (id_hilo_origen -> id_hilo_padre…)
--     *_destino    -> *_hijo       (id_hilo_destino -> id_hilo_hijo…)
--
-- Síntoma (14 de octubre de 2026): «Conectividad fina» falla en las 185
-- cubiertas. Al corregir cada columna salía la siguiente: pe.id_equipo,
-- pe.tipo_puerto, d.id_cubierta, cf.id_hilo_origen, pe_orig.id_equipo.
--
-- Dos no son solo un cambio de nombre:
--
-- * tipo_puerto valía 'IN' / 'OUT' y dir_principal_senhal es el enum
--   geo_fiber.enum_dir_signal ('E' / 'S' / 'B'). La función compara con 'IN'
--   y 'OUT', así que se traduce: E -> 'IN', S -> 'OUT' (B queda 'B').
-- * id_ubicacion era la cubierta donde está la conexión. id_contenedor es la
--   cubierta (tipo_contenedor 'CUB') o el divisor ('DIVISOR': las 95 salidas
--   de divisor hacia un hilo), el ODF o la OLT. Para que las del divisor sigan
--   saliendo en su cubierta, si el contenedor es un divisor se toma la
--   cubierta del divisor.
--
-- tab_fiber.tarjeta_bandeja_eqp sigue llamando id_equipo y tipo_equipo a sus
-- columnas: solo se cambia lo que va con cada alias, y solo si el alias es de
-- esa tabla. Las claves del JSON que devuelve la función quedan igual, así
-- que el esquemático de Dario no se entera.
--
-- Se corre en el editor SQL de Supabase, un paso a la vez (seleccionar el paso
-- y ejecutar). Se puede correr más de una vez.


-- PASO 0. Respaldo. Copiar el resultado y guardarlo: para volver atrás basta
-- pegarlo en el editor y ejecutarlo.
select pg_get_functiondef('public.get_json_conectividad_cubierta(uuid)'::regprocedure);


-- PASO 1. Diagnóstico (solo lee). Cada «alias.columna» de la función cuyo
-- alias es de una tabla (tab_fiber.x alias) y cuya columna no está en esa
-- tabla, con la línea donde aparece.
with def as (
  select pg_get_functiondef('public.get_json_conectividad_cubierta(uuid)'::regprocedure) as d
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


-- PASO 2. Corregir y probar. Cambia esas columnas, vuelve a crear la función
-- (CREATE OR REPLACE conserva sus permisos) y la prueba con TODAS las
-- cubiertas. Si alguna sigue fallando, no se guarda nada: el error dice
-- cuántas fallan, el mensaje de la primera y las columnas que siguen sin
-- existir en su tabla (mandárselo a quien la revise).
do $$
declare
  definicion text := pg_get_functiondef('public.get_json_conectividad_cubierta(uuid)'::regprocedure);
  nueva text := definicion;
  cub record;
  bien int := 0;
  mal int := 0;
  primer_error text;
  faltan text;
  a text;
  -- Lo que puede seguir a «tabla» sin ser su alias.
  no_alias text[] := array['on', 'where', 'join', 'left', 'right', 'inner', 'full', 'cross', 'group', 'order',
                           'limit', 'and', 'or', 'union', 'lateral', 'as', 'using', 'returns', 'language', 'set'];
begin
  -- \M exige fin de palabra: lo ya corregido (pe.id_equipo_pert) no vuelve a cambiar.

  -- Cada tabla puede ir con varios alias en la función (puerto_equipo va como
  -- pe, pe_orig y pe_dest): se corrigen todos.

  -- puerto_equipo
  for a in select distinct lower(m[1]) from regexp_matches(nueva, 'puerto_equipo\s+(?:as\s+)?([a-z_][a-z0-9_]*)\M', 'gi') as m
           where lower(m[1]) <> all (no_alias) loop
    nueva := regexp_replace(nueva, '\m' || a || '\.id_equipo\M',   a || '.id_equipo_pert',   'g');
    nueva := regexp_replace(nueva, '\m' || a || '\.tipo_equipo\M', a || '.tipo_equipo_pert', 'g');
    -- tipo_puerto valía 'IN' / 'OUT'; la columna nueva, 'E' / 'S' / 'B'.
    nueva := regexp_replace(nueva, '\m' || a || '\.tipo_puerto\M',
      format('(case %1$s.dir_principal_senhal when ''E'' then ''IN'' when ''S'' then ''OUT'' else %1$s.dir_principal_senhal::text end)', a), 'g');
  end loop;

  -- divisor_optico
  for a in select distinct lower(m[1]) from regexp_matches(nueva, 'divisor_optico\s+(?:as\s+)?([a-z_][a-z0-9_]*)\M', 'gi') as m
           where lower(m[1]) <> all (no_alias) loop
    nueva := regexp_replace(nueva, '\m' || a || '\.id_cubierta\M', a || '.id_cubierta_ubica', 'g');
  end loop;

  -- conectividad_fina
  for a in select distinct lower(m[1]) from regexp_matches(nueva, 'conectividad_fina\s+(?:as\s+)?([a-z_][a-z0-9_]*)\M', 'gi') as m
           where lower(m[1]) <> all (no_alias) loop
    -- La cubierta donde está la conexión: la del divisor si el contenedor es un divisor.
    nueva := regexp_replace(nueva, '\m' || a || '\.id_ubicacion\M',
      format('(case when %1$s.tipo_contenedor = ''DIVISOR'' then (select dv.id_cubierta_ubica from tab_fiber.divisor_optico dv where dv.id = %1$s.id_contenedor) else %1$s.id_contenedor end)', a), 'g');
    nueva := regexp_replace(nueva, '\m' || a || '\.([a-z_]+)_origen\M',  a || '.\1_padre', 'g');
    nueva := regexp_replace(nueva, '\m' || a || '\.([a-z_]+)_destino\M', a || '.\1_hijo',  'g');
    -- tipo_elemento_* se llama ahora tip_elemento_*.
    nueva := regexp_replace(nueva, '\m' || a || '\.tipo_elemento_(padre|hijo)\M', a || '.tip_elemento_\1', 'g');
  end loop;

  -- Las columnas que siguen sin existir en su tabla (el paso 1, sobre la
  -- versión corregida), para el mensaje si algo falla.
  with alias as (
    select distinct lower(m[3]) as alias, lower(m[1]) as esquema, lower(m[2]) as tabla
    from regexp_matches(nueva, '\m(tab_fiber|geo_fiber|geo_infra|public)\.([a-z_][a-z0-9_]*)\s+(?:as\s+)?([a-z_][a-z0-9_]*)\M', 'gi') as m
    where lower(m[3]) <> all (no_alias)
  ),
  usos as (
    select distinct lower(m[1]) as alias, lower(m[2]) as columna
    from regexp_matches(nueva, '\m([a-z_][a-z0-9_]*)\.([a-z_][a-z0-9_]*)\M', 'gi') as m
  )
  select string_agg(distinct u.alias || '.' || u.columna || ' (' || t.tabla || ')', ', ')
    into faltan
    from usos u join alias t using (alias)
   where not exists (select 1 from information_schema.columns c
                     where c.table_schema = t.esquema and c.table_name = t.tabla and c.column_name = u.columna);

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
    raise exception 'No se guardó nada: % de % cubiertas siguen fallando. Primer error: %. Columnas que no existen en su tabla: %',
      mal, bien + mal, primer_error, coalesce(faltan, 'ninguna');
  end if;
  raise notice 'Función corregida: las % cubiertas responden.', bien;
end $$;


-- PASO 3. Comprobar con una cubierta (CO19). Debe devolver un JSON, no un error.
select public.get_json_conectividad_cubierta(
  (select id from geo_fiber.cubierta_empalme where etiqueta = 'CO19' limit 1)
);
