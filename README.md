# GISmart

Visor y editor web de la red de fibra óptica de **G&G Technology SAS**. Muestra sobre un
mapa las cubiertas de empalme (mufas) y los cables de fibra reales almacenados en
Supabase/PostGIS, permite consultar sus atributos, medir sobre el terreno y revisar la
conectividad interna de cada mufa.

---

## Stack

| Pieza | Tecnología |
| --- | --- |
| Framework | Next.js 16 (App Router) + React 19 + TypeScript |
| Estilos | Tailwind CSS v4 + componentes shadcn sobre `@base-ui/react` |
| Mapa | OpenLayers 10 (`ol`) sobre teselas de OpenStreetMap |
| Esquemas de mufa | JointJS (`@joint/core`) |
| Base de datos | Supabase (PostgreSQL + PostGIS) |
| Gestor de paquetes | pnpm |

---

## Requisitos

- Node.js 22 LTS o superior
- pnpm 11 o superior
- Acceso al proyecto de Supabase (URL + secret key)

---

## Puesta en marcha

```bash
pnpm install
cp .env.example .env.local   # y completar los valores reales
pnpm run dev                 # http://localhost:3000
```

Otros comandos:

```bash
pnpm run build   # build de producción
pnpm start       # sirve el build (puerto 3000)
pnpm run lint    # eslint
npx tsc --noEmit # solo verificación de tipos
```

---

## Variables de entorno

Se definen en `.env.local` (ignorado por git). `​.env.example` tiene la plantilla.

| Variable | Para qué sirve |
| --- | --- |
| `AUTH_JWT_SECRET` | Secreto HMAC-SHA256 con el que se firma el token de sesión que emite la app. No es un token de Supabase Auth. |
| `SUPABASE_URL` | URL del proyecto de Supabase. |
| `SUPABASE_SECRET_KEY` | Secret key del proyecto. **Nunca** debe llevar el prefijo `NEXT_PUBLIC_`: da acceso total saltándose RLS y solo se usa del lado del servidor. |

> Si falta alguna variable, las rutas de API responden 500 con un mensaje explicando
> cuál no está configurada, en vez de fallar silenciosamente.

---

## Arquitectura

El navegador **nunca** habla directo con Supabase. Todas las consultas pasan por rutas
de API de Next.js que corren en el servidor:

```
Navegador  →  /api/...  (servidor Next.js)  →  Supabase (PostgREST)
```

Esto es deliberado por tres razones:

1. La secret key se queda en el servidor; si el navegador consultara Supabase
   directamente habría que exponer una clave pública y montar RLS por tabla.
2. Evita problemas de CORS y de contenido mixto.
3. Deja un punto único donde normalizar la geometría a GeoJSON y renombrar campos.

### Endpoints

| Ruta | Qué hace |
| --- | --- |
| `POST /api/auth/login` | Valida usuario/clave contra `public.usuario_app` y devuelve un JWT firmado. |
| `GET /api/mufas` | Devuelve un `FeatureCollection` con las cubiertas de empalme. |
| `GET /api/fiber-cables` | Devuelve un `FeatureCollection` con los cables de fibra. |
| `GET /api/cabeceras` | Devuelve un `FeatureCollection` con las cabeceras centrales. |
| `GET /api/reverse-geocode` | Traduce `lon`/`lat` al nombre del municipio (Nominatim/OSM), para el subtítulo del mapa. |
| `GET /api/geocode` | Busca municipios/zonas por texto (Nominatim/OSM, limitado a Colombia) para el buscador de la cabecera. |

Los dos endpoints geográficos leen vistas que ya exponen `geom` como GeoJSON. El detalle
de esas vistas y de los permisos necesarios está en
[`docs/base-de-datos.md`](docs/base-de-datos.md).

---

## El mapa

### Simbología

Se reutiliza la simbología del sistema anterior (SIGETP) para que el ingeniero de red
reconozca los elementos sin recalibrar la vista:

- **Cabecera central:** círculo blanco con un triángulo inscrito, en verde y de mayor
  tamaño que el resto de puntos, porque es el origen de la red. Su etiqueta se muestra
  siempre.
- **Cubierta de empalme (mufa):** círculo blanco con una cruz inscrita. El color depende
  de `funcion_cub`:
  - Segundo nivel → magenta
  - Primer nivel → azul
  - Empalme pasivo → naranja
  - Sin dato → gris
- **Cable de fibra:** línea cuyo **grosor crece con `cant_hilo`** (más hilos, trazo más
  grueso). El color está preparado para separar troncal (azul) de distribución (magenta)
  vía `tipo_red_prin`; hoy ese campo llega vacío en los 182 cables, así que todos se
  dibujan con el color por defecto de la capa. Encima de la línea va la etiqueta NAP y
  debajo la longitud.

Los símbolos y los cables llevan un **contorno blanco** para despegarse del mapa base:
sin él, con 185 mufas concentradas el conjunto se leía como una mancha y los cables se
confundían con las calles.

**Jerarquía:** 162 de las 185 mufas son de segundo nivel, así que las de primer nivel se
dibujan un 30 % más grandes y por encima de las demás (las de empalme pasivo, un 15 %).
Solo cambia el tamaño y el orden de dibujo, no los colores acordados.

Las etiquetas solo aparecen al acercar el zoom (rotular 367 elementos satura el mapa) y
**se descartan las que se solapan**. Los símbolos, en cambio, se dibujan siempre: en un
SIG, esconder un elemento sería esconder un dato.

Los símbolos de la leyenda y del panel de capas salen de `components/map-symbols.tsx`,
compartido, para que mapa, leyenda y panel no se desincronicen.

Los mismos símbolos se reutilizan en el panel de capas y en la leyenda.

### Herramientas

Barra vertical a la izquierda del mapa:

| Herramienta | Descripción |
| --- | --- |
| Mover mapa | Solo desplazamiento, no intercepta clicks. |
| Editar elementos | Click para seleccionar (abre el panel de atributos) y arrastrar vértices para corregir trazados. |
| Dibujar mufa | Agrega una cubierta nueva. |
| Trazar fibra | Dibuja un cable. **Obliga a empezar y terminar sobre una mufa** (con snap); si no, cancela el trazo y avisa. `Esc` cancela. |
| Zona de cobertura | Dibuja un polígono de cobertura. |
| Eliminar geometría | Resalta en rojo lo que está bajo el cursor y lo borra al hacer click. |
| Medir distancia | Traza una línea libre y muestra la distancia en vivo (m / km). |
| Medir área | Dibuja un polígono libre y muestra el área en vivo (m² / ha / km²). |

Las **teclas 1 a 8** activan las herramientas en ese mismo orden. Se ignoran mientras se
escribe en un campo, para no cambiar de herramienta al teclear un nombre.

Con las herramientas de selección activas, el **doble click no hace zoom**: en ese modo
debe actuar sobre el elemento, y el salto de zoom hacía perder lo que se estaba
consultando.

Las mediciones son efímeras: no se guardan en la base de datos y se limpian al salir de
las herramientas de medición (o con el botón «Limpiar»).

### Navegación

- **Teclado**: con el foco puesto en el mapa (Tab o un click), las **flechas
  desplazan** y **+ / −** acercan y alejan. OpenLayers ya traía esa capacidad, pero el
  contenedor no podía recibir el foco, así que nunca llegó a funcionar.
- **Shift + arrastrar** hace zoom sobre un rectángulo.
- **Encuadrar sobre una capa**: cada capa del panel tiene un botón de puntería que ajusta
  el mapa a sus elementos. Útil para saltar a una capa con pocos elementos —las
  cabeceras, por ejemplo— sin buscarla a mano.
- **Centrar en el mapa**: el panel del elemento seleccionado permite traerlo al centro.
  Tras filtrar o buscar, lo seleccionado puede quedar fuera de la vista.
- **Inicio → Mapa de red** encuadra sobre la red completa (cabeceras, mufas y fibra).

### Ayudas de lectura

- **Etiqueta al pasar el cursor**: muestra tipo y nombre del elemento bajo el puntero, a
  cualquier zoom. Las etiquetas del mapa solo salen de cerca, así que sin esto había que
  hacer click para saber qué era cada punto.
- **Resalte de selección**: lo seleccionado lleva un halo azul en el mapa, no solo la
  ficha en el panel. Con 185 mufas juntas, antes no había forma de saber cuál se tocó.
- **Barra de escala** abajo a la izquierda, para juzgar distancias sin medir.
- **El mapa recuerda la última vista** (centro y zoom) entre sesiones, en vez de volver
  siempre al encuadre completo de la red.

La barra de estado inferior izquierda muestra **longitud, latitud, zoom y la herramienta
activa**. El subtítulo de la cabecera muestra el **municipio que se está
viendo** y se actualiza al navegar: el mapa emite su centro al terminar cada
desplazamiento y el dashboard lo traduce con `/api/reverse-geocode`.

> El servicio de Nominatim limita la frecuencia de consultas, así que las coordenadas se
> redondean a ~100 m, la petición se retrasa 700 ms tras el último movimiento y la
> respuesta se cachea un día.

### El ribbon

El ribbon replica la estructura del SIG anterior (SIGETP), así que la mayoría de sus
botones son todavía la maqueta heredada. Los que ya ejecutan una acción real son:

| Botón | Acción |
| --- | --- |
| Inicio → Mapa de red | Reencuadra el mapa sobre la red cargada. |
| Inicio → Extensión | Pantalla completa del panel del mapa. |
| Inicio → Actualizar | Vuelve a pedir las tres capas a los endpoints. |
| Inicio → Identificar / Consultas → Atributos | Activa la herramienta de selección para consultar atributos. |
| Proyectos → Acercar ext. | Reencuadra sobre la red. |
| Edición → Crear / Borrar / Mover vértice / Editar atributos | Activan la herramienta correspondiente del mapa. |
| Varios → Mediciones | Activa la herramienta de medir distancia. |
| Usuario → Salir | Cierra sesión (con confirmación). |

Los demás muestran un aviso de que la función no está disponible todavía, en vez de no
hacer nada al pulsarlos.

El ribbon **se pliega** pulsando la pestaña activa (como en Office) o con la flecha de la
derecha, y recuerda la preferencia. Entre cabecera, pestañas y barra se iban casi 190 px
de alto antes de que empezara el mapa.

### Panel de capas

Cada capa muestra su símbolo real, su conteo y un ojo para ocultarla. Las de mufas y
fibra **se despliegan** con el desglose por categoría:

- Mufas por `funcion_cub` (segundo nivel, primer nivel, empalme pasivo).
- Cables por `cant_hilo`, con el trazo dibujado al grosor que tienen en el mapa.

Pulsar una categoría **filtra el mapa para ver solo esa**; se pueden marcar varias y cada
capa filtra por separado. Lo filtrado no se dibuja y tampoco es seleccionable, así que no
queda nada invisible pero clickeable. El desglose y el filtro usan la misma función de
clasificación (`categoriaDeMufa` / `categoriaDeCable`), de modo que las etiquetas del
panel siempre coinciden con lo que el filtro deja ver.

### Buscador

El campo de la cabecera busca municipios y zonas contra Nominatim y centra el mapa en el
resultado elegido. **No resuelve direcciones exactas**: OpenStreetMap no tiene ese nivel de
detalle para la mayoría de municipios colombianos, por eso el campo habla de «municipio o
zona» y la búsqueda está limitada a Colombia (`countrycodes=co`).

### Consultar atributos (identify)

Con «Editar elementos» seleccionado, al hacer click sobre una mufa, un cable o una
cabecera aparece el panel lateral con el botón **«Ver información»**, que abre una tabla
de solo lectura con los campos que trae la base de datos para ese elemento
(`components/info-table-dialog.tsx`, reutilizado por los tres tipos).

La tabla **no depende de una lista fija de columnas**: las que tienen etiqueta curada
salen con su nombre y en un orden pensado para consulta en campo, y cualquier columna
nueva aparece igualmente, con un nombre derivado del de la columna. Así un cambio de
esquema no deja datos ocultos.

Para las mufas hay además dos acciones propias: **«Gestionar esquema»** y
**«Ver conexiones»**, que abren el diagrama de conectividad interna (bandejas, buffers e
hilos) construido con JointJS.

---

## Autenticación

1. El login (`components/gismart-login.tsx`) envía usuario y clave a `/api/auth/login`.
2. La ruta busca el registro en `public.usuario_app` por `nombre` (comparación
   insensible a mayúsculas) y verifica que `activo` sea verdadero.
3. Si coincide, firma un JWT HMAC-SHA256 con `AUTH_JWT_SECRET` y lo devuelve.
4. El cliente lo guarda en `localStorage` (si se marcó «recordarme») o en
   `sessionStorage`, y `components/auth-guard.tsx` protege las rutas del dashboard.

### Protección de los endpoints

**Todas las rutas de `/api` exigen el token**, salvo el propio login. El cliente lo envía
en la cabecera `Authorization: Bearer …` (ver `fetchConSesion` en `lib/auth.ts`) y el
servidor **verifica la firma** antes de consultar nada (`lib/auth-server.ts`).

Esto no era así: las rutas de datos estaban abiertas, así que cualquiera que alcanzara el
servidor podía descargar la red completa —mufas con sus direcciones, cables y la
ubicación de la cabecera— sin iniciar sesión. Las de geocodificación también, lo que
además convertía al servidor en un proxy gratuito de Nominatim.

Firmar y verificar viven en el mismo módulo para que no puedan desincronizarse. La
comprobación rechaza tokens caducados, con firma alterada, firmados con otro secreto, y
los que intentan cambiar el contenido (por ejemplo, subirse el rol a `admin`): el cuerpo
va dentro de lo que se firma.

> La validación del lado del cliente (`isTokenValid`) solo lee la fecha de expiración
> para decidir qué pantalla mostrar. **No** es una comprobación de seguridad: la de
> verdad es la del servidor.

### Contraseñas

Se guardan con **hash scrypt** (`lib/password.ts`), no en texto plano. Se eligió scrypt
por venir en el propio Node: el despliegue es un servidor Windows y los módulos nativos
—bcrypt, argon2— son la fuente habitual de problemas de instalación.

La migración desde el texto plano anterior es **transparente**: el login acepta los dos
formatos y sustituye la contraseña por su hash la primera vez que esa persona entra. Si
la sustitución falla, el login sigue funcionando y el fallo queda en el registro del
servidor: nadie se queda sin entrar por un problema de migración.

Requiere dos cambios en la base —la columna era `varchar(12)` y un hash ocupa 86
caracteres— detallados en [`docs/base-de-datos.md`](docs/base-de-datos.md), junto con el
script para cerrar la migración sin esperar a que todos inicien sesión.

> ⚠️ **Pendiente:** mientras quede alguna contraseña en texto plano, ese formato sigue
> siendo válido para entrar. Cuando ya no quede ninguna, conviene quitar ese camino de
> `verificarClave`. Tampoco hay todavía columna de rol: la ruta asigna `usuario` a todos.

---

## Despliegue

La guía para publicarlo en el servidor Windows de la empresa (Node + NSSM como servicio +
IIS como reverse proxy) está en
[`docs/despliegue-windows.md`](docs/despliegue-windows.md).

---

## Estructura del proyecto

```
app/
  api/                    Rutas de API (backend liviano contra Supabase)
    auth/login/           Login contra usuario_app
    mufas/                Cubiertas de empalme como GeoJSON
    fiber-cables/         Cables de fibra como GeoJSON
    cabeceras/            Cabeceras centrales como GeoJSON
    geocode/              Búsqueda de municipios (Nominatim)
    reverse-geocode/      Municipio del centro del mapa (Nominatim)
  dashboard/              Vista principal (mapa) y vista de mufa
  error.tsx               Pantalla de error con reintento
  not-found.tsx           404 propio
  page.tsx                Login
components/
  network-map.tsx         Mapa OpenLayers: capas, interacciones, herramientas
  map-symbols.tsx         Símbolos en SVG, compartidos por leyenda y panel
  info-table-dialog.tsx   Tabla de atributos reutilizable (identify)
  gismart-mark.tsx        Marca de la aplicación (login, panel, favicon)
  mufa-*.tsx              Esquema y conectividad interna de la mufa
  dashboard-*.tsx         Cabecera, ribbon y barra lateral
  ui/                     Componentes base (shadcn / base-ui)
lib/
  map/symbology.ts        Colores, símbolos, etiquetas y clasificación de capas
  map/loaders.ts          Carga de las capas reales desde los endpoints
  supabase-geojson.ts     Sirve una vista *_geojson como FeatureCollection
  auth.ts                 Manejo de sesión en el cliente
  theme.ts                Modo claro/oscuro persistido en localStorage
  network-colors.ts       Paleta de las capas
  schematic/              Modelo y dibujo de los esquemas JointJS
docs/                     Documentación operativa
```

---

## Pendientes conocidos

Cosas que conviene tener presentes antes de dar el proyecto por terminado:

- **Nada de lo que se dibuja o edita en el mapa se guarda.** Crear una mufa, trazar
  fibra, mover un vértice o cambiar un nombre solo existe en el navegador; al recargar se
  pierde. Hoy la aplicación es un **visor** con herramientas de dibujo, no un editor.
  Para que lo sea faltan endpoints de escritura y decidir permisos por usuario.
- **Contraseñas en texto plano** en `usuario_app` (ver arriba).
- **Teselas de OpenStreetMap**: `tile.openstreetmap.org` es un servicio comunitario y su
  política de uso prohíbe el uso intensivo o comercial. Durante las pruebas llegó a
  cortar el servicio y el mapa se quedó sin fondo. Para producción conviene un servidor
  de teselas propio o un proveedor con contrato.
- **Código sin usar**: `components/network-schematic.tsx`, `lib/schematic/network-graph.ts`,
  `network-mockups.ts` y `legacy-mufa.ts` (~1.480 líneas) no son alcanzables desde
  ninguna página. Están pendientes de confirmar si son trabajo en curso de la pestaña
  «Esquemático» antes de eliminarlos.
- **La conectividad interna de la mufa** (`mufa-schematic`, `mufa-connectivity-modal`,
  `mufa-schema-dialog`, `lib/schematic/`) la mantiene otra persona del equipo.
