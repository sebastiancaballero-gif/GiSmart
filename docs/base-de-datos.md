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
  id, nombre, codigo, id_proyecto, etiqueta, est_const, direccion_catastral,
  desc_capacidad, creado_en, actualizado_en,
  st_asgeojson(geom)::json as geom
from geo_infra.cabecera_central;

grant usage on schema geo_infra to service_role;
grant select on geo_infra.cabecera_central_geojson to service_role;
```

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
`cable_fibra` indican qué elementos une cada cable. Todavía no se consumen en la app; son
el camino natural para construir la conectividad real entre mufas.
