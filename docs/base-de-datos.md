# Base de datos (Supabase / PostGIS)

Notas de configuración del proyecto de Supabase `GiSmart Web`
(`nuogjuwuhyeuzlsuvipc`). Sirven para dejar funcionando un entorno nuevo sin repetir la
serie de errores que costó descubrir la primera vez.

---

## Tablas y esquemas que usa la app

| Objeto | Esquema | Uso |
| --- | --- | --- |
| `usuario_app` | `public` | Login de la aplicación. |
| `cubierta_empalme` | `geo_fiber` | Cubiertas de empalme (mufas). |
| `cable_fibra` | `geo_fiber` | Cables de fibra. |
| `cabecera_central` | `geo_infra` | Cabeceras centrales (origen de la red). |

---

## Por qué hay vistas `_geojson`

PostgREST devuelve las columnas `geometry` de PostGIS en **WKB hexadecimal**, que
OpenLayers no sabe leer. Para evitar convertir en el cliente, cada tabla geográfica se
consulta a través de una vista que ya entrega la geometría como GeoJSON con
`st_asgeojson(geom)::json`.

> ⚠️ **`CREATE OR REPLACE VIEW` no permite renombrar ni reordenar columnas existentes**
> (error `42P16`). Si hay que agregar campos a una vista ya creada, deben ir **al final**,
> después de todas las columnas actuales, respetando el orden previo. Si se necesita
> reordenar, hay que hacer `DROP VIEW` y volver a crearla.

### `geo_fiber.cubierta_empalme_geojson`

```sql
create or replace view geo_fiber.cubierta_empalme_geojson as
select
  id, etiqueta, tipo_carcasa, funcion_cub, tipo_empalme, estado_const,
  tipo_instala, capacidad_bandejas,
  st_asgeojson(geom)::json as geom,
  cod_fabricante, id_proyecto, direccion, ubicacion,
  fecha_creacion, fecha_ult_act
from geo_fiber.cubierta_empalme;

grant select on geo_fiber.cubierta_empalme_geojson to service_role;
```

### `geo_fiber.cable_fibra_geojson`

```sql
create or replace view geo_fiber.cable_fibra_geojson as
select
  id, nombre, codigo, cod_fabricante, estado_const, id_proyecto, etq_naps,
  tipo_red_prin, tipo_fibra, atenuacion_1490, atenuacion_1550,
  tipo_instala, tipo_cable, marca, modelo, cant_buff, cant_hilo,
  longitud_medida, longitud_calc,
  id_elem_from, tip_elem_from, id_elem_to, tip_elem_to,
  st_asgeojson(geom)::json as geom
from geo_fiber.cable_fibra;

grant select on geo_fiber.cable_fibra_geojson to service_role;
```

### `geo_infra.cabecera_central_geojson`

```sql
create or replace view geo_infra.cabecera_central_geojson as
select
  id, id_legacy, nombre, codigo, id_proyecto, etiqueta, tipo_est_const,
  direccion_catastral, desc_capacidad, creado_en, actualizado_en,
  st_asgeojson(geom)::json as geom
from geo_infra.cabecera_central;

grant usage on schema geo_infra to service_role;
grant select on geo_infra.cabecera_central_geojson to service_role;
```

> Esta tabla ya se recreó dos veces con columnas distintas (`id` pasó de `int4`
> a `uuid`, apareció `id_legacy` y `est_const` se renombró a `tipo_est_const`).
> **Al borrar una tabla, PostgreSQL se lleva las vistas que dependen de ella y
> sus permisos**, así que hay que volver a ejecutar este bloque cada vez.
> Ver «Qué pasa cuando cambia el esquema» más abajo.

---

## Permisos necesarios

La secret key actúa con el rol `service_role`, pero eso **no** implica acceso automático:
hay que otorgarlo explícitamente.

```sql
-- Login
grant select on public.usuario_app to service_role;

-- Acceso al esquema geográfico (además del grant por vista)
grant usage on schema geo_fiber to service_role;
```

Síntomas si falta alguno:

| Error de la API | Causa |
| --- | --- |
| `permission denied for table usuario_app` | Falta el `grant select` sobre la tabla. |
| `permission denied for schema geo_fiber` | Falta `grant usage on schema`. |
| `Invalid schema: geo_fiber` | El esquema no está en «Exposed schemas». |

---

## Exponer el esquema en la Data API

Además de los permisos de PostgreSQL, PostgREST solo atiende esquemas declarados:

**Project Settings → Data API → Exposed schemas** → agregar `geo_fiber`
(junto con `public`, que ya viene por defecto).

Y en el cliente de Supabase hay que pedir ese esquema explícitamente:

```ts
createClient(url, secretKey, { db: { schema: "geo_fiber" } })
```

---

## Estado actual de los datos (referencia)

Relevado directamente contra la base:

| Campo | Valores presentes |
| --- | --- |
| `cubierta_empalme.funcion_cub` | Segundo nivel (162), Primer nivel (21), Empalme pasivo (2) |
| `cubierta_empalme.tipo_empalme` | FUSION (185) |
| `cable_fibra.tipo_fibra` | MULTI (182) |
| `cable_fibra.tipo_red_prin` | **vacío en los 182 registros** |

Por eso el mapa colorea las mufas por `funcion_cub` (es el campo que sí discrimina) y
dibuja los cables con grosor según `cant_hilo`. La separación visual troncal/distribución
ya está implementada en `colorForTipoRed()` y se activará sola en cuanto se diligencie
`tipo_red_prin`.

Los campos `id_elem_from` / `tip_elem_from` / `id_elem_to` / `tip_elem_to` de
`cable_fibra` indican qué elementos une cada cable. Ya se muestran en la ficha del cable,
pero todavía no se usan para dibujar la topología: son el camino natural para construir
la conectividad real entre mufas.

---

## Qué pasa cuando cambia el esquema

Conviene tener claro qué es automático y qué no, porque ya tropezamos dos veces
con lo mismo.

| Cambio en la base | ¿Hay que tocar algo? |
| --- | --- |
| Agregar, editar o borrar registros | **No.** Aparecen solos al recargar. |
| Agregar una columna a una tabla | Sí: recrear la vista. La ruta y la ficha la toman solas. |
| Renombrar una columna | Sí: recrear la vista con el nombre nuevo. |
| Recrear la tabla (`drop`/`create`) | Sí: la vista y sus permisos se pierden con la tabla. |
| Una tabla nueva (capa nueva) | Sí: vista, ruta y simbología. |

Del lado de la aplicación ya no hay listas de columnas que mantener:

- Las rutas piden `select *`; **la vista es el contrato** de qué se expone.
- La ficha «Ver información» muestra cualquier columna que llegue: las que
  tienen etiqueta curada salen con su nombre y en su orden, y el resto aparece
  con un nombre derivado del de la columna en vez de quedar oculto.

> **Ojo con `select *` en la definición de la vista**: PostgreSQL congela la
> lista de columnas al crear la vista. Escribir `select *` allí no hace que la
> vista incorpore columnas futuras; hay que recrearla igual.

### Cómo dejar de depender de las vistas

Una función no se borra al borrar la tabla, y si se escribe sin nombrar las
columnas una por una, tampoco se rompe cuando se renombren o se agreguen:

```sql
create or replace function geo_infra.cabeceras_geojson()
returns json language sql stable as $$
  select json_build_object(
    'type', 'FeatureCollection',
    'features', coalesce(json_agg(json_build_object(
      'type', 'Feature',
      'geometry', st_asgeojson(t.geom)::json,
      'properties', to_jsonb(t) - 'geom'
    )), '[]'::json)
  )
  from geo_infra.cabecera_central t;
$$;

grant execute on function geo_infra.cabeceras_geojson() to service_role;
```

`to_jsonb(t) - 'geom'` toma todas las columnas que existan en ese momento. Con
este enfoque, recrear la tabla o cambiarle columnas dejaría de requerir trabajo
ni en SQL ni en código. Está propuesto, no implementado.

Complemento útil, para no tener que acordarse de dar permisos a tablas futuras:

```sql
alter default privileges in schema geo_infra grant select on tables to service_role;
alter default privileges in schema geo_fiber grant select on tables to service_role;
```

---

## Contraseñas: migración a hash

Las contraseñas de `usuario_app` estaban en **texto plano**. Ahora se guardan con
`scrypt` (ver `lib/password.ts`), pero la base necesita dos cambios antes de que
la migración pueda completarse:

```sql
-- 1. La columna era varchar(12) y un hash ocupa 86 caracteres.
alter table public.usuario_app alter column clave type varchar(255);

-- 2. La aplicación solo tenía permiso de lectura, así que no podía reescribir
--    la contraseña. Se concede solo sobre esa columna, no sobre toda la tabla.
grant update (clave) on public.usuario_app to service_role;
```

### Cómo se migra

**Sola, a medida que la gente entra.** El login acepta los dos formatos: si la
contraseña guardada está en texto plano y coincide, se sustituye por su hash en
ese mismo momento. Nadie queda fuera y no hay que coordinar nada.

Si el `UPDATE` falla —falta el permiso, o la columna sigue siendo corta— **el login
sigue funcionando** y el fallo queda registrado en la consola del servidor. Es a
propósito: nadie debe quedarse sin entrar por un problema de migración.

Para cerrarla de una vez, sin esperar a que todos inicien sesión:

```bash
node scripts/migrar-claves.mjs            # informa, no cambia nada
node scripts/migrar-claves.mjs --aplicar  # escribe los hashes
```

### Formato guardado

```
scrypt$16384$8$1$<sal en base64>$<hash en base64>
```

Es autodescriptivo: lleva sus propios parámetros de coste, así que se puede subir
el coste más adelante sin invalidar lo ya almacenado. Cada contraseña tiene una sal
distinta, de modo que dos personas con la misma contraseña no comparten hash.

> Cuando ya no quede ninguna contraseña en texto plano, conviene quitar del login
> el camino que las acepta (`verificarClave` en `lib/password.ts`). Mientras exista,
> una contraseña en texto plano sigue siendo válida para entrar.
