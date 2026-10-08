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
| Mapa | OpenLayers 10 (`ol`) sobre teselas de OpenStreetMap (o el proveedor de `NEXT_PUBLIC_TESELAS_URL`) |
| Esquemas de mufa | JointJS (`@joint/core`) |
| Base de datos | Supabase (PostgreSQL + PostGIS) |
| Gestor de paquetes | pnpm |

---

## Sobre las librerías de interfaz

**No hace falta agregar ninguna.** Conviene dejarlo escrito porque la pregunta
vuelve cada vez que algo se ve mejorable.

El proyecto ya trae **Base UI** (`@base-ui/react`), que es la base sobre la que
están hechos los componentes de shadcn. Base UI expone más de cuarenta
primitivas sin estilo —tooltip, popover, menu, select, tabs, toast, switch,
slider, scroll-area, accordion, combobox y demás—, todas accesibles y
manejables por teclado. De esas cuarenta, el proyecto solo tenía envueltas
**seis**: badge, button, checkbox, dialog, input y label.

Así que la respuesta a «qué librería usar para que se vea mejor» casi siempre es
«la que ya está instalada». Antes de sumar una dependencia conviene mirar si
Base UI ya resuelve el caso: cada paquete nuevo es peso en el navegador, una
reinstalación para todo el equipo y una cosa más que puede fallar al desplegar
en el servidor Windows.

Ejemplo real: la interfaz usaba el atributo `title` del navegador en 29 sitios.
Ese tooltip tarda cerca de un segundo en salir, se pinta con el estilo del
sistema operativo (un recuadro claro que desentona con el tema oscuro) y **no
existe en pantallas táctiles**, donde media barra de herramientas quedaba sin
explicación. Se resolvió con `components/ui/tooltip.tsx`, un envoltorio de
treinta líneas sobre la primitiva de Base UI. Cero dependencias nuevas.

Lo que sí falta y ninguna librería arregla es trabajo de diseño: jerarquía,
espaciado y consistencia. Para eso ya están Tailwind v4 y los tokens de color de
`app/globals.css`.

### Animaciones

Tampoco hace falta una librería de animación: bastan CSS, las transiciones de Base UI
(`data-starting-style` / `data-ending-style`) y `tw-animate-css`, que ya venía instalado.

- **Entrada**: login → «Bienvenido» → tablero sin cortes. «Verificando sesión…» solo asoma
  si la comprobación tarda más de 300 ms; el tablero entra escalonado (cabecera, ribbon,
  panel de capas y mapa) y la cortina «Cargando la red de fibra…» se desvanece en vez de
  desaparecer de golpe.
- **Ventanas**: suben un poco al abrirse y salen más rápido de lo que entran.
- **Mapa**: al ubicar algo desde el buscador o desde una ventana, un **destello** marca
  dónde quedó (`lib/map/destello.ts`).
- **Tema**: el cambio claro/oscuro es un fundido de toda la pantalla (View Transitions).
- **Celular**: el panel del elemento sube desde abajo; el buscador baja desde la cabecera.

Las entradas usan `animation-fill-mode: backwards` y no `both`: con `both` el último
fotograma queda puesto para siempre, y un transform puesto encierra a los elementos
`position: fixed` de adentro (así se rompió la ventana de conexión del login). Con
«reducir movimiento» activado en el sistema, todo esto se apaga.

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

> **Al traer cambios de otra persona, vuelve a instalar:**
>
> ```bash
> git pull
> pnpm install
> ```
>
> `package.json` y el lockfile están versionados, pero tenerlos no instala nada. Si
> alguien agregó una dependencia y tú no reinstalas, verás un error del tipo
> `Module not found: Can't resolve '@supabase/supabase-js'`. No es un fallo del código:
> es que esa librería no está en tu `node_modules`.
>
> El proyecto usa **pnpm** y así queda declarado en `package.json` (`packageManager`).
> Instalar con `npm` o `yarn` sobre un lockfile de pnpm produce un `node_modules`
> distinto al del resto del equipo, y con él fallos que solo le ocurren a una persona.

Otros comandos:

```bash
pnpm run build   # build de producción
pnpm start       # sirve el build (puerto 3000)
pnpm run lint    # eslint
npx tsc --noEmit # solo verificación de tipos
pnpm verificar   # tipos + lint + pruebas sin base: lo de correr antes de subir un cambio
```

Pruebas sueltas: `pnpm run capa`, `pnpm run busqueda` y `pnpm run sesion` no necesitan la
base; `pnpm run conectividad` y `pnpm auditar` sí (la auditoría hace intentos de login
reales y puede dejar una cuenta bloqueada 30 segundos).

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
| `GET /api/mufas/{id}/conectividad` | Conectividad interna de una mufa, generada por la función `get_json_conectividad_cubierta`. Solo se pide al consultar una cubierta con el botón «Conectividad fina»; elegir una mufa no la pide. Es solo lectura. |
| `GET /api/mufas/{id}/cables` | Cables de entrada y salida de una mufa, según `geo_fiber.fn_json_conectividad_cubierta(p_uuid_cubierta)`. Devuelve solo UUID, sentido y color de cada cable. Solo lectura. |
| `GET /api/cables/{id}/extremos` | Extremos de un cable (dónde sale y dónde entra), según `geo_fiber.fn_json_extremos_cable(p_uuid_cable)`. Solo lectura. |
| `GET /api/reverse-geocode` | Traduce `lon`/`lat` al nombre del municipio (Nominatim/OSM), para el subtítulo del mapa. |
| `GET /api/geocode` | Busca municipios/zonas por texto (Nominatim/OSM, limitado a Colombia) para el buscador de la cabecera. |

Los endpoints geográficos leen vistas que ya exponen `geom` como GeoJSON. Si una vista
falta —se borran junto con su tabla, y ya pasó tres veces— la ruta cae automáticamente a
la tabla base y deja que PostgREST arme el GeoJSON, de modo que la capa sigue cargando.
El detalle de esas vistas, del respaldo y de los permisos que necesita está en
[`docs/base-de-datos.md`](docs/base-de-datos.md).

Todas las respuestas llevan cabeceras de seguridad (`X-Frame-Options`, `nosniff`,
`Referrer-Policy`, `Permissions-Policy`) definidas en `next.config.mjs`: detrás de IIS no
hay ninguna plataforma que las ponga por su cuenta, y sin ellas la pantalla de inicio de
sesión se puede incrustar en un iframe ajeno.

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
| Editar elementos | Click para seleccionar cualquier elemento (abre el panel de atributos). Arrastrar vértices, renombrar o quitar solo se puede si el elemento es de la **capa activa**; si no, el panel queda en consulta y dice qué capa activar. |
| Dibujar cubierta | Agrega una cubierta nueva. Necesita activa la capa «Cubiertas». |
| Trazar fibra | Dibuja un cable. **Obliga a empezar y terminar sobre una cubierta** (con snap); si no, cancela el trazo y avisa. `Esc` cancela. Necesita activa la capa «Tendido de fibra». |
| Zona de cobertura | Dibuja un polígono de cobertura. Necesita activa la capa «Zonas». |
| Eliminar geometría | Resalta en rojo lo que está bajo el cursor y lo borra al hacer click. Solo actúa sobre la capa activa. |
| Medir distancia | Traza una línea libre y muestra la distancia en vivo (m / km). |
| Medir área | Dibuja un polígono libre y muestra el área en vivo (m² / ha / km²). |
| Conectividad fina | Desde el ribbon (Consultas → Red). El cursor pasa a mira y a mano sobre las cubiertas; al pulsar una se pide su conectividad y se abre el esquemático en modo consulta. Otros elementos se ignoran. |
| Entradas y salidas | Desde el ribbon (Consultas → Red). Al pulsar una mufa se llama a `geo_fiber.fn_json_conectividad_cubierta` (de Carlos) con su UUID, por `GET /api/mufas/{id}/cables`, y sus cables quedan pintados con el color que manda la función: **entrante verde, saliente naranja**. Siguen pintados hasta pulsar otra mufa (que los reemplaza), pulsar fuera o cambiar de herramienta, y la leyenda los muestra mientras la herramienta está activa. Al pulsar un cable, en vez de pintar entradas y salidas, se resalta ese cable y el aviso dice cuál es: código, hilos, tipo de red y los dos elementos que une. Es una capa solo visual: la geometría se toma de la capa de cables del mapa; de la función solo se usan el UUID, el sentido y el color. |
| Cable | Desde el ribbon (Consultas → Red). Lo mismo que «Entradas y salidas», pero desde el cable: al pulsarlo se pinta de **rojo** y sus puntas se marcan: **«Entrada»** (verde) en la mufa padre y **«Salida»** (naranja) en la mufa hija. Se probó pintar el cable en dos colores y resultó enredado: el color va solo en las mufas. Cuál es cuál lo dice solo la función propia del cable, `fn_json_extremos_cable` (`GET /api/cables/{id}/extremos`): la punta `PADRE` es la entrada y la `HIJO` la salida. Los colores son los de su `color_resalte`, que coinciden con la leyenda. Si la función falla o su respuesta no alcanza para marcar las dos puntas, el aviso lo dice con el detalle de lo que respondió. El aviso dice el código, los hilos, el tipo de red y en qué mufa está la entrada y en cuál la salida. Solo lectura. |

Una mufa **no tiene conectividad en la app hasta que se consulta con el botón
«Conectividad fina»**, aunque la base ya la tenga: elegir la mufa no pregunta nada. Por
eso en el panel «Ver conexiones» y «Gestionar esquema» salen en gris hasta consultarla.
Después se activan para esa mufa, y así se vuelve a abrir el esquema sin repetir la
consulta. Siguen en gris si la consulta no trajo cables. Consultar es solo leer: la
función arma el JSON en el momento y no guarda nada.

#### Capa activa

Pedido del ingeniero a cargo del proyecto: antes de editar, mover o crear **se activa la
capa** sobre la que se va a trabajar, como en un SIG de escritorio. Así no se mueve una
cubierta queriendo corregir un cable que pasa por encima, ni se borra lo que no era.

- Se activa con **«Activar capa»** (Inicio → Capas) o **pulsando la capa** en «Capas de
  red». Pulsarla otra vez, o «Activar capa» con una capa ya activa, la desactiva. La flecha
  de la izquierda sigue desplegando el desglose.
- La capa activa se resalta en el panel, «Activar capa» queda encendido en el ribbon y la
  barra de estado dice sobre qué capa se trabaja («Editar elementos · Cubiertas»).
- Dibujar necesita activa su capa; eliminar necesita una capa activa y solo quita de esa.
  Lo que no se puede usar se ve apagado en la barra y, al pulsarlo, avisa qué capa activar.
- Activar una capa oculta la muestra; ocultar la capa activa la desactiva.
- Consultar no necesita capa activa.

Por ahora nada de lo editado se guarda: la base todavía no tiene cómo recibir las
ediciones. El flujo queda listo para cuando las haya. Las reglas viven en
`lib/map/capa-activa.ts` y se prueban con `pnpm run capa`.

El botón del teclado, al pie de la barra (o la tecla **?**), muestra todos los atajos.

Las **teclas 1 a 8** activan las herramientas en ese mismo orden. Se ignoran mientras se
escribe en un campo, para no cambiar de herramienta al teclear un nombre.

El elemento activo lleva una **marca roja**: la mufa que se está consultando con «Conectividad fina» o «Entradas y salidas» y, con las demás herramientas, el elemento seleccionado. Una mufa o una cabecera llevan un punto con su anillo; un cable se resalta entero y lleva el punto en la mitad, para poder ubicarlo con el mapa alejado; una zona lleva el borde resaltado. Así se distingue cuál es entre muchas mufas juntas o entre cables que se cruzan.

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
  cabeceras, por ejemplo— sin buscarla a mano. Si hay un filtro por categoría activo,
  encuadra **solo sobre lo que se está viendo**: filtrar a «Primer nivel» y encuadrar
  antes alejaba el mapa hasta abarcar las 185 mufas, incluidas las ocultas.
- **Centrar en el mapa**: el panel del elemento seleccionado permite traerlo al centro.
  Tras filtrar o buscar, lo seleccionado puede quedar fuera de la vista.
- **Inicio → Mapa de red** encuadra sobre la red completa (cabeceras, mufas y fibra).

### Ayudas de lectura

- **Etiqueta al pasar el cursor**: muestra tipo y nombre del elemento bajo el puntero, a
  cualquier zoom. Las etiquetas del mapa solo salen de cerca, así que sin esto había que
  hacer click para saber qué era cada punto.
- **Resalte de selección**: lo seleccionado lleva un halo azul en el mapa, no solo la
  ficha en el panel. Con 185 mufas juntas, antes no había forma de saber cuál se tocó.
- **Barra de escala** abajo a la izquierda, para juzgar distancias sin medir, con la
  proporción (1 : 4 252) arriba y las distancias debajo.
- **Leyenda** abajo a la derecha. En el celular empieza plegada, y con el mapa bajo (una
  portátil) se aparta mientras el panel del elemento está abierto, porque la tapaba.
- **El mapa recuerda la última vista** (centro y zoom) entre sesiones, en vez de volver
  siempre al encuadre completo de la red.

La barra de estado inferior izquierda muestra **longitud, latitud, zoom y la herramienta
activa**. El zoom y los créditos del mapa base (la «i») van arriba a la derecha; zoom,
créditos y escala son controles de OpenLayers reestilizados en `app/globals.css`
(`.gismart-mapa`) para que se vean como el resto. El subtítulo de la cabecera muestra el **municipio que se está
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
| Inicio → Actualizar | Vuelve a pedir las tres capas a los endpoints. Lo que estaba seleccionado se vuelve a elegir al terminar, si sigue en la base. |
| Inicio → Identificar / Consultas → Atributos | Activa la herramienta de selección para consultar atributos. |
| Proyectos → Acercar ext. | Reencuadra sobre la red. |
| Edición → Crear / Borrar / Mover vértice / Editar atributos | Activan la herramienta correspondiente del mapa. |
| Varios → Mediciones | Activa la herramienta de medir distancia. |
| Inicio → Activar capa | Activa o desactiva la capa sobre la que se edita (ver «Capa activa»). |
| Consultas → Búsqueda | Lleva al buscador de arriba (también Ctrl+K). |
| Red de fibra → Hilos | Abre «Gestión de hilos» del cable (ver abajo). |
| Red de fibra → GPON | Abre «Elementos alimentados por fibra óptica» (ver abajo). |
| Red de fibra → Redes/Nodo | Abre «Consulta de redes por nodo de fibra óptica» (ver abajo). |
| Usuario → Salir / Cambiar usuario | Cierra sesión (con confirmación). |
| Varios → A coordenada | Lleva al buscador para escribir una latitud y longitud. |

Qué hace cada botón lo dice su `accion` en `components/dashboard-ribbon-data.ts`. Los que
no tienen se ven **apagados, con un reloj y «Próximamente»** en la etiqueta emergente, y
al pulsarlos avisan que falta su función. Antes todos se veían iguales y solo se sabía
cuáles funcionaban probándolos. Los que funcionan explican qué hacen al pasar el ratón.

Las pestañas se recorren con las flechas (Inicio y Fin van a la primera y a la última) y,
en pantallas angostas, se desplazan a lo ancho en vez de quedar cortadas.

El ribbon **se pliega** pulsando la pestaña activa (como en Office) o con la flecha de la
derecha, y recuerda la preferencia. Entre cabecera, pestañas y barra se iban casi 190 px
de alto antes de que empezara el mapa.

### Ventanas de Red de fibra

Siguen las pantallas del SIG anterior, con los nombres que pidió el equipo y sin lo que
todavía no tiene función en la base. Lo que falta lo dice al pulsarlo («… todavía no está
disponible: falta la función en la base»). Comparten las piezas de
`components/ventana-sig.tsx` (campos amarillos, botones, avisos sin datos, barra de
estado), así que se ven iguales.

| Ventana | Qué hace hoy | Qué espera de la base |
| --- | --- | --- |
| **Gestión de hilos** (`gestion-hilos-dialog.tsx`) | Se elige el cable en el mapa (o abre con el seleccionado) y lista sus hilos con `tab_fiber.fn_obtener_hilos_cable_json(p_id_cable)`: número con su color, buffer, colores, tecnología y estado, agrupados por buffer, con filtro por buffer y buscador. Al elegir un hilo muestra su UUID. | Rack, ODF, puertos, equipo, tarjeta, transporte y destino (columnas «pendiente»); simulación de corte y recorridos. |
| **Elementos alimentados por fibra óptica** (`elementos-alimentados-dialog.tsx`) | Nodo origen: lista de cabeceras, búsqueda por caracteres, elegir el nodo en el mapa y ubicarlo. «Cod. Nivel 1 totales»: las cubiertas de primer nivel del mapa, con flechas y ubicar. | «Cod. Nivel 1 de la cabecera», puertos nivel 2, NAP conectada y recorridos. |
| **Consulta de redes por nodo** (`redes-nodo-dialog.tsx`) | Lista de nodos (cabeceras), ubicar el nodo en el mapa y las pestañas Cables salientes, Cables entrantes, Primer nivel y Nivel 2. | «Cargar cubiertas», GPON / METH, exportar y las filas de cada pestaña. Columnas como en el SIG anterior: cables con identificador, código y longitud; cubiertas con identificador, código y dirección. |

**Planta interna y externa** (`components/planta/`). Nueve ventanas tomadas de las pantallas del
SIG anterior que llegaron en «Conectividad Fina.pptx»; qué botón abre cada una lo marcó el equipo
en la versión 3 de esa presentación. Por ahora son **solo la vista**: botones,
grillas con sus columnas, pestañas y el recuadro de modificación, apagado hasta elegir una fila.
Los racks, las OLT y los ODF no están en el mapa, así que todo lo que consulta o guarda espera
su función en la base y lo dice al pulsarlo. Inventario y Ocup. cables eligen el nodo de las
cabeceras del mapa, como Redes/Nodo.

| Botón (Red de fibra) | Ventana | Contenido |
| --- | --- | --- |
| Puertos OLT | Gestión de puertos de equipos | Pestañas OLT y ODF con el estado de uso de cada puerto; potencia real y nota del puerto. |
| Inventario | Reporte de inventario de red de fibra óptica | Por nodo o por contrato, en resumen o en detalle (cuatro pestañas). |
| OLT-ODF | Conectividad de puertos entre OLT y ODF | Tarjeta y puerto de la OLT conectados a cada puerto del ODF. |
| ODF-ODF | Gestión alfanumérica de conectividad de puertos de ODF | Puertos de un ODF conectados a los de otro, con cable e hilo de cada lado. |
| ODF-Cables | Conectividad de puertos entre ODF y cables de salida | Cable e hilo que salen de cada puerto del ODF. |
| Ocup. OLT / Ocup. ODF | Reporte de ocupación de OLT / de ODF | Puertos ocupados con su arpón y su divisor. |
| Ocup. cables | Reporte gráfico de ocupación de cables de fibra en el nodo | Hilos libres, conectados y ocupados de cada cable, con sus porcentajes. |
| Cross conn. | Cargue y grabación de datos de un archivo Excel de conectividades | Elemento y archivo; tipo de conectividad (empalme, OLT-ODF, ODF-ODF, ODF-CAB); validar, importar y exportar; pestañas Archivo y Errores. |
| Trace (Reportes) | Recorrido del trace | Ventana pequeña que **no oscurece ni bloquea el mapa** (un click en el mapa no la cierra, Esc sí). Se pega el UUID de un puerto o de un hilo y se recorre hacia arriba (hacia la OLT) o hacia abajo (hacia el usuario). El recorrido **no se calcula**: se lee ya calculado de la tabla de caché `tab_fiber.element_connection` (una fila por origen y sentido, con los pasos en `path_secuencia`, la geometría en `geom_path` y la fecha del cálculo), por la ruta `GET /api/trace?id=…&direccion=UPSTREAM|DOWNSTREAM`; la función `fn_trace_conectividad_fina` ya no se llama. Se pinta en magenta y la ventana da el largo, la atenuación, los pasos y cuándo se calculó. Mientras `geom_path` llegue vacío se pintan los cables de los hilos del recorrido (`tab_fiber.hilo_cable`). Al cerrar la ventana la línea queda; se quita con «Quitar del mapa». Pruebas: `pnpm run trace`. |
| Enrutamiento (Consultas) | Enrutamiento de hilos | Nodo de fibra (cabeceras del mapa) y arpón (cubiertas de primer nivel) con sus herramientas; potencia máxima de salida OLT, margen de guarda y a qué elemento va el hilo más bajo; siete pestañas. Por ahora todas llevan las columnas de «OLTs» (Identificador, Cod Rack, Código OLT, Fecha Presup, Observación) hasta que se confirmen las demás. |

Las funciones que devuelven filas se leen de forma tolerante: los nombres de campo se
comparan sin mayúsculas, tildes ni guiones, así que un cambio de nombre en la función
(«Tecnología», «num_buffer») no rompe la pantalla. Pruebas: `pnpm run hilos` y `pnpm run red`
(listas de nodos y de «Cod. Nivel 1», búsqueda por caracteres y flechas).

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

El campo de la cabecera busca en dos sitios a la vez:

- **Elementos de la red** (cubiertas, cables, cabeceras y zonas) por nombre, código o el
  principio del UUID, desde la primera letra y sin preguntar a ningún servidor: el mapa
  publica un índice de lo que tiene cargado (`lib/map/busqueda.ts`). Al elegir uno, el mapa
  lo centra y abre su ficha; si su capa estaba oculta, la muestra, y si el filtro de
  categorías del panel lo dejaba fuera, le suma su categoría.
- **Municipios y zonas** contra Nominatim, **solo al pedirlo**: desde la tercera letra, la
  última opción de la lista es «Buscar … en direcciones» (Enter la elige cuando es la única).
  La política de uso de Nominatim prohíbe consultar mientras se escribe, y como todas las
  búsquedas salen del servidor de la empresa, un bloqueo dejaría sin direcciones a todos.
- **Coordenadas** escritas como latitud, longitud: «4.5333, -76.0883», «4.5333 -76.0883»
  o con coma decimal, «4,5333; -76,0883». No se le preguntan a Nominatim. Si el primer
  número no cabe como latitud (más de 90) y el segundo sí, se entiende al revés.

Al elegir una dirección o una coordenada, el mapa la centra y la marca con un **pin
violeta** con el texto buscado; el pin se quita con el siguiente click sobre el mapa. Al
llegar, un destello (violeta para el pin, turquesa para un elemento de la red) señala el
punto exacto.

Se abre con **Ctrl+K** desde cualquier parte del tablero o con «Búsqueda» (Consultas →
Elementos) y se recorre con las flechas y Enter. En pantallas angostas el campo no cabe en
la cabecera: se abre con la lupa y flota debajo. Las pruebas del orden de los resultados y
de las coordenadas se corren con `pnpm run busqueda`.

Nominatim **no resuelve direcciones exactas**: OpenStreetMap no tiene ese nivel de
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

Los campos **sin dato se ocultan** (la ficha dice cuántos y se ven con un click), con más
de 8 campos aparece un **buscador** por nombre o valor, y cada valor se **copia** con su
botón (en las referencias a otro elemento se copia el UUID). Copiar funciona también
detrás de un IIS en HTTP, donde el navegador no ofrece el portapapeles moderno.

El panel de una cubierta o una cabecera muestra sus **coordenadas** con botón para
copiarlas y un acceso **«Cómo llegar»** que abre la ruta en Google Maps. En pantallas
angostas el panel va abajo y a todo el ancho, para no tapar las herramientas del mapa.

Para las mufas hay además dos acciones propias: **«Gestionar esquema»** y
**«Ver conexiones»**, que abren el diagrama de conectividad interna (bandejas, buffers e
hilos) construido con JointJS.

---

## Autenticación

1. El login (`components/gismart-login.tsx`) envía usuario y clave a `/api/auth/login`.
2. La ruta busca el registro en `public.usuario_app` por `nombre` (comparación
   insensible a mayúsculas) y verifica que `activo` sea verdadero.
3. Si coincide, firma un JWT HMAC-SHA256 con `AUTH_JWT_SECRET` y lo deja en la cookie
   httpOnly `gismart_sesion` (SameSite=Strict, Secure con HTTPS): ningún script de la
   página lo puede leer. Con «Recordar usuario» dura las 8 horas del token; sin él, se
   borra al cerrar el navegador.
4. En el navegador solo queda quién entró y cuándo vence la sesión.
   `components/auth-guard.tsx` pregunta a `GET /api/auth/sesion` al abrir el tablero y
   protege sus rutas. **Cinco minutos antes** de que venza avisa a qué hora vence, y al
   vencer vuelve al login con un mensaje (antes la sesión se cortaba sin aviso).

### Protección de los endpoints

**Todas las rutas de `/api` exigen la sesión**, salvo el propio login. El token viaja en
una **cookie `httpOnly`** que pone el servidor al iniciar sesión: el navegador la manda sola
y el JavaScript de la página no la puede leer, así que un script inyectado (XSS) no se la
puede llevar. Antes el token vivía en `localStorage`, a su alcance. El servidor **verifica
la firma** antes de consultar nada (`lib/auth-server.ts`); por cabecera `Authorization:
Bearer …` también se acepta, para los scripts de prueba.

- La cookie es `SameSite=Strict` (otra web no puede hacer que el navegador la mande, así que
  no sirve para peticiones falsificadas) y `Secure` cuando la petición llega por HTTPS,
  también detrás de IIS (`X-Forwarded-Proto`).
- Con «Recordar usuario» dura las ocho horas del token aunque se cierre el navegador; sin
  él, se borra al cerrarlo.
- `GET /api/auth/sesion` dice si hay sesión (lo pregunta el tablero al abrir) y
  `POST /api/auth/logout` borra la cookie al salir.
- En el navegador solo queda quién entró y cuándo vence, para la interfaz.
- Pruebas: `pnpm run sesion`.

Esto no era así: las rutas de datos estaban abiertas, así que cualquiera que alcanzara el
servidor podía descargar la red completa —mufas con sus direcciones, cables y la
ubicación de la cabecera— sin iniciar sesión. Las de geocodificación también, lo que
además convertía al servidor en un proxy gratuito de Nominatim.

Firmar y verificar viven en el mismo módulo para que no puedan desincronizarse. La
comprobación rechaza tokens caducados, con firma alterada, firmados con otro secreto, y
los que intentan cambiar el contenido (por ejemplo, subirse el rol a `admin`): el cuerpo
va dentro de lo que se firma.

> Lo que guarda el navegador (el vencimiento) solo sirve para decidir qué pantalla mostrar
> mientras llega la respuesta del servidor. **No** es una comprobación de seguridad: la de
> verdad es la del servidor, en cada petición.

La sesión dura ocho horas, más que una jornada con el mapa abierto. Cuando vence, la
aplicación lo dice y devuelve al login: `fetchConSesion` cierra la sesión ante cualquier
401 y `AuthGuard` avisa en el momento exacto de la expiración y al volver a la pestaña.
Antes solo se comprobaba al entrar, así que al vencer el token las capas empezaban a
fallar una tras otra y lo que se veía era un mapa vacío, sin explicación.

### Qué valida el formulario de inicio de sesión

Solo lo mismo que valida la ruta, para ahorrar un viaje al servidor que ya se
sabe que va a fallar. Nada más, y esto importa: el formulario exigía antes una
contraseña de **al menos 6 caracteres** y un usuario sin tildes ni espacios,
reglas que la base nunca tuvo. La columna original era `varchar(12)`, así que
había contraseñas más cortas: quien tuviera una de 5 caracteres no podía entrar
y el formulario le decía que su propia contraseña era inválida, sin llegar a
enviar nada. Le pasaba a una de las cinco cuentas.

Un mínimo de longitud pertenece a la pantalla donde se **crea** una contraseña,
que este proyecto todavía no tiene. Aquí solo se comprueba que los campos no
estén vacíos y que no superen el tope que acepta el servidor.

Cuando el servidor bloquea la cuenta por intentos fallidos devuelve
`lockedUntil`, y el formulario lo convierte en una cuenta atrás: el botón se
apaga y dice cuántos segundos faltan, en vez de mostrar un «30s» congelado que
obligaba a probar a ciegas.

### Informe de calidad de los datos

```bash
pnpm run datos
```

`scripts/revisar-datos.mjs` contrasta lo que el mapa calcula contra lo que guarda la
base y revisa que la red sea consistente: si las longitudes coinciden, si los extremos
de cada cable apuntan a elementos que existen, si hay mufas superpuestas o geometrías
a medio digitalizar. Conviene correrlo cada vez que entren datos nuevos, porque los
problemas de datos no los ve el compilador y llegan igual al ingeniero de red.

Los hallazgos de la última revisión están en
[`docs/base-de-datos.md`](docs/base-de-datos.md).

### Auditoría de seguridad

```bash
pnpm run auditar
```

`scripts/auditar-seguridad.mjs` importa la ruta de login de verdad y le lanza los
ataques que en su momento funcionaron, sin necesidad de levantar el servidor. Comprueba
que el nombre de usuario ya no admite comodines de SQL, que responder tarda lo mismo
exista o no la cuenta, que el registro de intentos fallidos no crece sin techo, que el
bloqueo por intentos sigue en pie y que el desglose del panel de capas no pierde
elementos con categorías de nombre raro. Sale con código 1 si algo falla.

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

### Cloudflare Pages no sirve para este proyecto

Se evaluó el 25 de septiembre de 2026 y **no es viable**. Queda escrito porque la idea
parece razonable —es gratis y esto es Next.js— y la pregunta va a volver.

La única ruta de Pages que Cloudflare sigue documentando para Next.js es la **exportación
estática**, y aquí no aplica: las nueve rutas de `app/api/` verifican sesión y consultan
Supabase, así que sin servidor no queda aplicación. La ruta dinámica era
`@cloudflare/next-on-pages`, marcada como descontinuada en npm («use the OpenNext adapter
instead») y con tope en Next 15.5.2, cuando el proyecto va por 16. Encima es
exclusivamente runtime *edge*, que rechaza los módulos de Node: `exigirSesion` importa
`node:crypto` y por ahí pasan las nueve rutas, de modo que declarar
`export const runtime = 'edge'` **las rompe todas**, no unas pocas.

Ese detalle es el que decide. En *edge* no existe `scrypt` —WebCrypto solo trae PBKDF2—,
así que habría que rehacer `lib/password.ts` e **invalidar todos los hashes guardados** en
`usuario_app`: nadie podría entrar hasta restablecer su clave.

Si algún día se quiere Cloudflare, el destino es **Workers**, no Pages, con
`@opennextjs/cloudflare`. Ahí corre el runtime de Node y `node:crypto` está soportado por
completo, `scrypt` incluido, así que la autenticación funciona sin tocarla y no hace falta
declarar `edge` en ninguna parte. Pide subir Next a 16.3.3 o superior (el adaptador no
soporta 16.0–16.3.2), un `wrangler.jsonc` con la bandera `nodejs_compat` y un
`open-next.config.ts`. Habría que revisar entonces las cabeceras de seguridad de
`next.config.mjs`, que existen porque detrás de IIS no hay plataforma que las ponga.
Cloudflare recomienda hoy `vinext`, que sí acepta Next 16 sin actualizar, pero está en
`1.0.0-beta.12`.

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
  map-legend.tsx          Leyenda plegable del mapa
  map-notices.tsx         Pila de avisos sobre el mapa
  map-status-bar.tsx      Coordenadas, zoom y herramienta activa
  info-table-dialog.tsx   Tabla de atributos reutilizable (identify)
  gismart-mark.tsx        Marca de la aplicación (login, panel, favicon)
  mufa-*.tsx              Esquema y conectividad interna de la mufa
  dashboard-*.tsx         Cabecera, ribbon y barra lateral
  ui/                     Componentes base sobre Base UI
  ui/tooltip.tsx          Etiqueta emergente, en vez del `title` del navegador
lib/
  map/symbology.ts        Colores, símbolos, etiquetas y clasificación de capas
  map/loaders.ts          Carga de las capas reales desde los endpoints
  map/capas.ts            Conteo por categoría y filtro del desglose
  map/herramientas.ts     Las ocho herramientas, su orden y sus avisos
  map/vista-guardada.ts   Última vista del mapa en localStorage
  supabase-geojson.ts     Sirve una capa como FeatureCollection, con respaldo
                          si falta la vista *_geojson
  auth-server.ts          Firma y verifica el token de sesion
  auth.ts                 Manejo de sesión en el cliente
  theme.ts                Modo claro/oscuro persistido en localStorage
  network-colors.ts       Paleta de las capas
  schematic/              Modelo y dibujo de los esquemas JointJS
scripts/
  auditar-seguridad.mjs   Relanza los ataques contra el login
  revisar-datos.mjs       Informe de calidad de los datos de la red
  migrar-claves.mjs       Cierra la migracion de contrasenas a hash
docs/                     Documentación operativa
```

---

## Pendientes conocidos

Cosas que conviene tener presentes antes de dar el proyecto por terminado:

- **Nada de lo que se dibuja o edita en el mapa se guarda.** Crear una mufa, trazar
  fibra, mover un vértice o cambiar un nombre solo existe en el navegador; al recargar se
  pierde. Hoy la aplicación es un **visor** con herramientas de dibujo, no un editor.
  Para que lo sea faltan endpoints de escritura y decidir permisos por usuario.
- **Cables sin cargar** (21 de septiembre de 2026): `geo_fiber.cable_fibra` está vacía,
  así que el mapa no dibuja tendido y ninguna mufa tiene conectividad que mostrar. Además,
  un disparador de esa tabla impide insertar cables hasta que se corrija. El detalle está
  en [`docs/base-de-datos.md`](docs/base-de-datos.md). Los permisos que se habían
  perdido ya se restauraron con
  [`docs/sql/permisos-service-role.sql`](docs/sql/permisos-service-role.sql).
- **Contraseñas**: al recrearse `usuario_app` no se sabe en qué formato quedaron. Las
  que estén en texto plano se migran solas a hash cuando esa persona entre, o de una
  vez con `node scripts/migrar-claves.mjs --aplicar`.
- **Las tres vistas `*_geojson` ya no existen.** Las capas cargan sin errores gracias al
  respaldo que lee las tablas directamente.
- **El bloqueo por intentos es por nombre de usuario**, así que quien conozca un nombre
  puede dejar esa cuenta bloqueada 30 segundos seguidos. Es el precio de bloquear por
  cuenta en vez de por IP; con la aplicación detrás de IIS, limitar por IP allí es la
  forma natural de completarlo.
- **Teselas de OpenStreetMap**: `tile.openstreetmap.org` es un servicio comunitario y su
  política de uso prohíbe el uso intensivo o comercial. Durante las pruebas llegó a
  cortar el servicio y el mapa se quedó sin fondo. Para producción conviene un servidor
  de teselas propio o un proveedor con contrato; se configura con `NEXT_PUBLIC_TESELAS_URL`
  (y `_ATRIBUCION`, `_ZOOM_MAXIMO`) sin tocar código. Ver `.env.example` y
  `lib/map/mapa-base.ts`.
- **Código sin usar**: `components/network-schematic.tsx`, `lib/schematic/network-graph.ts`,
  `network-mockups.ts` y `legacy-mufa.ts` (~1.480 líneas) no son alcanzables desde
  ninguna página. Están pendientes de confirmar si son trabajo en curso de la pestaña
  «Esquemático» antes de eliminarlos.
- **La conectividad interna de la mufa** (`mufa-schematic`, `mufa-connectivity-modal`,
  `mufa-schema-dialog`, `lib/schematic/`) la mantiene otra persona del equipo.
