# Base de datos (Supabase / PostGIS)

Notas de configuración del proyecto de Supabase `GiSmart Web`
(`nuogjuwuhyeuzlsuvipc`). Sirven para dejar funcionando un entorno nuevo sin repetir la
serie de errores que costó descubrir la primera vez.

---

## Estado de la base (21 de septiembre de 2026)

### Resuelto

Varias tablas se recrearon y perdieron sus permisos: nadie podía iniciar sesión ni
consultar la conectividad de las mufas. Se arregló ejecutando
[`sql/permisos-service-role.sql`](sql/permisos-service-role.sql), que incluye además
los privilegios por defecto para que recrear una tabla no vuelva a romper la
aplicación.

### Recarga en curso (21 de septiembre de 2026, tarde)

Carlos está recargando las tablas. Lo que ya se ve en lo cargado:

| Qué | Estado |
| --- | --- |
| Columnas de auditoría | Pasaron a `creado_en`/`creado_por`/`modificado_en`/`modificado_por` en las tres tablas. Con eso el disparador `fn_auditar()` ya no falla, y los cables se pudieron insertar |
| `geo_fiber.cable_fibra` | 182 cables cargados |
| Origen y destino de cada cable | **Sin cargar**: `tip_elem_from`/`tip_elem_to` son `DESCON` e `id_elem_from`/`id_elem_to` vienen vacíos en los 182. Antes resolvían todos |
| `cable_fibra.codigo` | Trae el identificador antiguo (`2099967`) y no el código del cable (`D_CD2_T1`, que sigue en `stg_cables.cod_cable`). Con `nombre` vacío, el mapa rotula los cables con esos números |
| `cable_fibra.cant_buff` | 0 en los 182, aunque tienen 48 o 144 hilos |
| `cubierta_empalme.funcion_cub` | El tercer valor pasó de «Empalme pasivo» a «Empalme». La aplicación ya usa el valor nuevo |
| Mufas, hilos, divisores | En 0 mientras dura la carga |
| Las vistas `*_geojson` | No existen; sin fallo visible gracias al respaldo |

Cuando termine la carga, `pnpm run datos` revisa la cadena completa de la que
depende «Ver conexiones» (cubierta → conexiones → hilos → cables) y cuenta en cuántas
mufas saldría el botón activo.

Sobre los UUID de los cables: `stg_cables` no trae ninguna columna que relacione cada
fila con su UUID. Se probó a emparejarlos por el orden de creación y solo coincidían
150 de 182, así que esa relación la tiene quien generó los UUID.

---

## Tablas y esquemas que usa la app

| Objeto | Esquema | Uso |
| --- | --- | --- |
| `usuario_app` | `public` | Login de la aplicación. |
| `cubierta_empalme` | `geo_fiber` | Cubiertas de empalme (mufas). |
| `cable_fibra` | `geo_fiber` | Cables de fibra. |
| `cabecera_central` | `geo_infra` | Cabeceras centrales (origen de la red). |
| `get_json_conectividad_cubierta(uuid)` | `public` | Conectividad interna de una mufa, generada al momento. Lee de `tab_fiber`. |

### `usuario_app`, recreada en septiembre de 2026

| Antes | Ahora |
| --- | --- |
| `id_usr`, `codigo`, `nombre`, `clave`, `activo` | `nombre_usuario` (clave primaria), `nombre_completo`, `correo`, `clave` (text), `activo` |

Se entra con `nombre_usuario`. La ruta de login y `scripts/migrar-claves.mjs` ya usan
las columnas nuevas. Como `clave` ahora es `text`, los hashes scrypt caben sin cambiar
el tipo de la columna.

### `cubierta_empalme`, recreada en septiembre de 2026

El `id` pasó de entero a **UUID**; el entero anterior quedó en `id_legacy`. Ese UUID es
el que recibe la función de conectividad.

### Conectividad de una mufa: quién hace qué

Acordado con Aurelio el 15 de septiembre de 2026:

1. **Carlos** (backend) mantiene `get_json_conectividad_cubierta`. Genera el JSON en el
   momento a partir de la conectividad registrada, así que cambia con cada cubierta.
2. **GISmart** solo hace de intermediario. Le manda a la función el UUID de la
   cubierta, recibe el JSON y se lo pasa al esquemático. Solo pregunta cuando se consulta una
   cubierta con el botón «Conectividad fina» del ribbon; elegir una mufa en el panel
   no pregunta nada. Es solo lectura.
3. **Dario** dibuja ese JSON. GISmart le indica aparte, con la prop `modo`, si es
   `"consulta"` o `"escritura"`. **El modo no va dentro del JSON**: la función solo
   genera la conectividad, sin saber para qué se va a usar.

> **Al 22 de septiembre de 2026, 3 p. m.: la carga está a medio hacer.** El
> ingeniero de backend está rehaciendo los extremos de los cables. Ahora mismo
> los 182 cables tienen `id_elem_from` vacío y `id_elem_to` apuntando al propio
> cable, así que ninguna mufa devuelve cables: las dos funciones responden bien
> (HTTP 200) pero con la lista vacía, y en la aplicación todas las mufas salen
> «sin conectividad». Lo que sigue en este apartado se midió antes de esa
> recarga y hay que volver a comprobarlo cuando termine, con `pnpm run datos` y
> `pnpm run conectividad`.

Qué devuelve hoy la función (21 de septiembre de 2026, después de corregirla con
`docs/sql/arreglar-funcion-conectividad.sql`): 184 de las 185 cubiertas traen sus
cables, cada uno con sus buffers e hilos, y sus divisores dentro de una bandeja que
arma la propia función (`bandeja_empalme` está vacía). La que falta no es extremo de
ningún cable. Pendiente para Carlos:

- `Conectividades` sale vacío en todas: las 562 filas de `tab_fiber.conectividad_fina`
  son de antes de la recarga y apuntan a cubiertas e hilos que ya no existen.
- El color de cada buffer sale igual al del primer hilo («Azul» en todos); debería
  salir de `hilo_cable.color_buffer`.
- En 151 cubiertas los divisores repiten `num_divisor` y `cod_divisor` (dos «D-1»).
- Los puertos de los divisores salen vacíos y `cable_fibra.cant_buff` está en 0.

Y una que toca a Carlos y a Dario: de las 184 cubiertas con cables, **56 no se pueden
dibujar**. El esquemático exige al menos un cable de entrada y uno de salida, y 44
cubiertas solo tienen cables con `sentido: "Salida"` (como la 13/14) y 12 solo con
`"Entrada"` (como CO01).

La causa (revisado el 22 de septiembre de 2026): la función decide el sentido por **el
sentido en que se dibujó el cable**, no por el de la señal. Si el cable termina en la
cubierta (`id_elem_to`) es «Entrada»; si empieza en ella (`id_elem_from`), «Salida». Se
cumple en 139 de 139 cables revisados. Y **147 de los 182 cables están dibujados al
revés**, desde la punta del ramal hacia la cabecera. Por ejemplo, los tres cables de
CO01 terminan en CO01, así que salen los tres como entrada, aunque dos de ellos (los
de 48 hilos hacia 11/12 y 9/10) son salidas. Por lo mismo, muchas de las 128 cubiertas
que sí se dibujan salen con entradas y salidas invertidas.

La regla del ingeniero de red: **una cubierta de primer nivel tiene una entrada y
salidas; una de segundo nivel puede ser terminal, con solo la entrada.** Recorriendo
la red desde la cabecera, los datos la cumplen:

| Nivel | Cubiertas | Cómo quedan con el sentido real |
| --- | --- | --- |
| Primer nivel | 21 | 19 con una entrada y sus salidas; CO90 y CO91 no están unidas a la cabecera |
| Segundo nivel | 162 | 111 con entrada y salidas; 47 terminales (solo entrada); 3 sin unir a la cabecera; 1 sin cables |
| Empalme | 2 | 1 con entrada y salidas; 1 sin unir a la cabecera |

Solo 25 cubiertas tienen hoy todos sus cables en el sentido correcto.

Qué hace falta:

- **Carlos:** que la función calcule el sentido por el recorrido desde la cabecera
  (entra el cable que viene del lado de la cabecera) o que se inviertan los 147 cables
  dibujados al revés. Y unir a la cabecera las 6 cubiertas sueltas.
- **Dario:** aceptar las cubiertas terminales de segundo nivel, con solo la entrada.
  Hoy el esquemático las rechaza (47 cubiertas). El JSON no dice de qué nivel es la
  cubierta: si Dario quiere exigir salidas solo en primer nivel, Carlos tiene que
  agregar el nivel (`funcion_cub`) al JSON.

`pnpm run datos` revisa todo esto cada vez que se corre (sección 2).

Mientras tanto, GISmart pasa el JSON por el mismo analizador del esquemático antes de
abrirlo y, si lo rechaza, muestra el motivo en vez de un diagrama roto.

Mientras un JSON no traiga cables, la aplicación trata la cubierta como **sin
conectividad**: «Ver conexiones» y «Gestionar esquema» salen en gris. Es la misma regla
del esquemático de Dario, que rechaza un JSON sin cables.

Dos detalles que costaron tiempo:

- El argumento de la función se llama **`p_cubierta_id`**. El ejemplo que llegó usaba
  `id_parametro`, y con ese nombre PostgREST responde que la función no existe
  (PGRST202).
- El ejemplo la llamaba desde el navegador. En GISmart va por la ruta del servidor
  `GET /api/mufas/{id}/conectividad`, porque la aplicación no tiene cliente de Supabase
  en el navegador: la clave nunca sale del servidor.

Para Dario: el modal `MufaConnectivityModal` todavía no declara `modo`. GISmart ya se
lo manda en cada apertura; basta con añadirlo a sus props y reenviarlo al esquemático:

```ts
type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  schema: MufaCampoJSON | null
  modo: "consulta" | "escritura"
}
```

Cuando lo declare, en `components/network-map.tsx` sobra el tipo ampliado
`ModalConectividad` y se usa su componente directamente.

---

## Por qué hay vistas `_geojson`

> **Desactualizado (21 de septiembre de 2026).** Las tablas se recrearon con otras
> columnas y los bloques de esta sección nombran algunas que ya no existen
> (`estado_const`, `capacidad_bandejas`, `tipo_fibra`, `marca`, `modelo`):
> ejecutarlos tal cual daría error. Hoy las tres vistas no existen y **no hacen falta**,
> porque las rutas caen solas a la tabla y PostgREST arma el GeoJSON (ver «Respaldo
> automático cuando falta la vista»). Si se quieren recrear, hay que ajustar antes la
> lista de columnas a la tabla actual.

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
| `cable_fibra.cant_hilo` | 48 (162), 144 (20) |
| `cabecera_central` | **0 registros, y su vista `_geojson` ya no existe** |

Ni una sola geometría inválida, fuera de Colombia o sin coordenadas en las tres
capas; tampoco etiquetas de mufa repetidas ni cables de longitud cero.

La capa de cabeceras se ve vacía porque la tabla lo está: al recrearla se
perdieron los registros y la vista. Los datos hay que volver a cargarlos; la
vista está más arriba en este documento.

Por eso el mapa colorea las mufas por `funcion_cub` (es el campo que sí discrimina) y
dibuja los cables con grosor según `cant_hilo`. La separación visual troncal/distribución
ya está implementada en `colorForTipoRed()` y se activará sola en cuanto se diligencie
`tipo_red_prin`.

Los campos `id_elem_from` / `tip_elem_from` / `id_elem_to` / `tip_elem_to` de
`cable_fibra` indican qué elementos une cada cable. Ya se muestran en la ficha del cable,
pero todavía no se usan para dibujar la topología: son el camino natural para construir
la conectividad real entre mufas.

---

## Calidad de los datos (revisión del 9 de septiembre de 2026)

Se contrastó lo que el mapa calcula contra lo que guarda la base, y se revisó la
consistencia de la red. El resumen es bueno; lo que sigue son los detalles que
conviene tener presentes.

### La longitud que muestra el mapa es correcta

El mapa no lee `longitud_calc`: mide la geometría con `getLength` de OpenLayers.
Comparando las dos sobre los 182 cables:

| Medida | Valor |
| --- | --- |
| Diferencia mediana | 0,19 % |
| Cables dentro del 1 % | 178 de 182 |
| Total del panel | 18,73 km |
| Suma de `longitud_calc` | 18,74 km |

Los cuatro que se salen (ids 543, 544, 545 y 546) quedan **entre 8,6 % y 9,2 %
por debajo** de lo que dice la base, todos en el mismo sentido. Eso no parece un
error de cálculo sino holgura o reserva registrada en la base que la geometría no
recoge. Vale la pena preguntarle al ingeniero de red.

### `longitud_medida` no es una medición

Es **idéntica a `longitud_calc` en los 182 cables**. En la ficha de datos se
muestran como dos campos distintos, lo que sugiere que uno viene de terreno y el
otro del cálculo. No es así: uno es copia del otro.

### La topología está completa

Los extremos de los cables (`tip_elem_from` / `id_elem_from` y sus pares `_to`)
resuelven todos:

- 363 extremos apuntan a una cubierta de empalme (`CUBGEN`), 1 a una cabecera (`CABE`).
- Ninguno viene vacío y **ninguno apunta a una mufa inexistente**.
- Solo la mufa `id 202` no aparece como extremo de ningún cable.
- No hay dos mufas en la misma coordenada.

Esto importa porque significa que la conectividad real entre mufas **ya se puede
construir con estos campos**, sin datos nuevos.

### Dos cosas que sí hay que arreglar en la base

1. El cable `id 392` termina en la cabecera `id 4`, pero `geo_infra.cabecera_central`
   está vacía: esa referencia queda colgada hasta recargar las cabeceras.
2. Diez cables miden menos de 5 m (ids 379, 381, 399, 410, 420, 424, 441, 460,
   475 y 525; el más corto, 1,2 m). Pueden ser tramos reales de patcheo o
   geometrías a medio digitalizar. Conviene revisarlos.

---

## Qué pasa cuando cambia el esquema

Conviene tener claro qué es automático y qué no, porque ya tropezamos dos veces
con lo mismo.

| Cambio en la base | ¿Hay que tocar algo? |
| --- | --- |
| Agregar, editar o borrar registros | **No.** Aparecen solos al recargar. |
| Agregar una columna a una tabla | Sí: recrear la vista. La ruta y la ficha la toman solas. |
| Renombrar una columna | Sí: recrear la vista con el nombre nuevo. |
| Recrear la tabla (`drop`/`create`) | **No**, si el respaldo está armado (ver abajo). Conviene recrear la vista igual. |
| Una tabla nueva (capa nueva) | Sí: vista, ruta y simbología. |

### Respaldo automático cuando falta la vista

Las vistas se borran junto con su tabla, así que recrear una tabla dejaba su
capa sin cargar hasta volver a crear la vista a mano. Pasó tres veces con
`cabecera_central`.

Ahora, si la vista no existe, la ruta pide la tabla base con la cabecera
`Accept: application/geo+json` y **PostgREST arma el FeatureCollection él
mismo**, sin necesitar `st_asgeojson`. La capa sigue funcionando y en la
consola del servidor queda el aviso de que la vista falta.

Para que el respaldo funcione, `service_role` tiene que poder leer la tabla:

```sql
grant select on geo_fiber.cubierta_empalme to service_role;
grant select on geo_fiber.cable_fibra      to service_role;
grant select on geo_infra.cabecera_central to service_role;
```

Estado comprobado el 9 de septiembre de 2026: armado en `cubierta_empalme` y
`cabecera_central`; **`cable_fibra` responde 403**, así que si se pierde su
vista, esa capa sí se cae hasta ejecutar el `grant` de arriba.

Dos diferencias respecto a la vista, por si algo se ve distinto:

- El respaldo devuelve **todas** las columnas de la tabla, también las que la
  vista ocultaba (`creado_por`, `actualizado_por`). Salen en «Ver información».
- El respaldo no puede curar nombres de columnas: entrega los de la tabla.

La vista sigue siendo el camino normal y el que define qué se expone. El
respaldo es una red, no un reemplazo.

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
