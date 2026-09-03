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
  dibujan con el color por defecto de la capa.

Las etiquetas (nombre de la mufa, longitud del cable) solo aparecen al acercar el zoom:
con 185 mufas y 182 cables, rotularlos siempre satura el mapa.

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

Las mediciones son efímeras: no se guardan en la base de datos y se limpian al salir de
las herramientas de medición (o con el botón «Limpiar»).

La barra de estado inferior izquierda muestra en todo momento **longitud, latitud y zoom**
de la posición del cursor. El subtítulo de la cabecera muestra el **municipio que se está
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

### Buscador

El campo de la cabecera busca municipios y zonas contra Nominatim y centra el mapa en el
resultado elegido. **No resuelve direcciones exactas**: OpenStreetMap no tiene ese nivel de
detalle para la mayoría de municipios colombianos, por eso el campo habla de «municipio o
zona» y la búsqueda está limitada a Colombia (`countrycodes=co`).

### Consultar atributos (identify)

Con «Editar elementos» seleccionado, al hacer click sobre una mufa o un cable aparece el
panel lateral con el botón **«Ver información»**, que abre una tabla de solo lectura con
todos los campos que trae la base de datos para ese elemento
(`components/info-table-dialog.tsx`, reutilizado por ambos tipos).

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

> ⚠️ **Pendiente de seguridad conocido:** la columna `clave` de `usuario_app` guarda la
> contraseña en **texto plano** y la comparación se hace tal cual. Está así porque es como
> viene la tabla hoy; migrarlo a hash (bcrypt/argon2) es una decisión pendiente del equipo.
> Tampoco hay todavía columna de rol: la ruta asigna `usuario` a todos.

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
  dashboard/              Vista principal (mapa) y vista de mufa
  page.tsx                Login
components/
  network-map.tsx         Mapa OpenLayers: capas, simbología, herramientas
  info-table-dialog.tsx   Tabla de atributos reutilizable (identify)
  mufa-*.tsx              Esquema y conectividad interna de la mufa
  dashboard-*.tsx         Cabecera, ribbon y barra lateral
  ui/                     Componentes base (shadcn / base-ui)
lib/
  auth.ts                 Manejo de sesión en el cliente
  theme.ts                Modo claro/oscuro persistido en localStorage
  network-colors.ts       Paleta de las capas
  schematic/              Modelo y dibujo de los esquemas JointJS
docs/                     Documentación operativa
```
