# Versiones de GISmart

La versión que se ve en el login sale de `package.json` (ver `lib/version.ts`); al pasar
el mouse sobre ella se ve el commit desde el que se compiló. Cada cambio importante sube la
versión y se anota aquí.

- **El número del medio** sube con cada cambio importante: una función o ventana nueva, o
  una mejora que se note al usarla (1.4.0 → 1.5.0).
- **El último** sube con arreglos que no cambian cómo se usa (1.5.0 → 1.5.1).
- **El primero** sube con cambios grandes que piden algo nuevo de la base o del servidor
  (1.x → 2.0.0).

## 1.5.4 — 13 de octubre de 2026

- **Trace desde Gestión de hilos:** al pedir otro recorrido, la ventana ya no muestra un momento
  la tabla del anterior bajo el hilo nuevo, ni la deja ahí si la consulta falla: se limpia y
  dice «Calculando…» hasta que llega el nuevo.
- **Origen del trace:** acepta el UUID entre llaves y en mayúsculas, como lo copian ArcGIS
  o SQL Server ({01A0…}); antes decía que no era un UUID.
- **Revisión:** auditoría de seguridad, pruebas de conectividad y el trace en modo
  producción, sin novedades del lado de la aplicación. Las fallas de conectividad son de la
  función `get_json_conectividad_cubierta` en la base (pide `pe.id_equipo`, que ahora es
  `id_equipo_pert`). El informe `pnpm run datos` vuelve a leer `conectividad_fina`.

## 1.5.3 — 13 de octubre de 2026

Revisión del trace contra la base y pruebas de lo que puede fallar.

- **Verificado:** en los 1762 recorridos, la tabla dice lo mismo que la base (hilos,
  cables, longitudes, puertos, divisores, equipos, central); los 11 526 pasos de la caché
  siguen en la conectividad de hoy; la caché coincide con la función del trace; los hilos
  coinciden con Gestión de hilos.
- **Base que no responde:** la consulta se corta a los 15 s. Antes el cliente de Supabase
  la reintentaba tres veces y tardaba 67 s (vale para todas las rutas, también el login).
  El mensaje dice que la base no respondió a tiempo o que no se pudo conectar.
- **Sin recorrido:** la ventana dice por qué (puerto de la OLT, salida o entrada de divisor,
  hilo suelto) en vez de «el UUID no existe», que no era cierto.
- **Respuesta que no es un recorrido** (vacía o rota): lo dice como error.
- **Muchos avisos:** se desplazan en su recuadro y la tabla queda a la vista.
- **Pruebas:** `pnpm run trace-ruta` (en `pnpm verificar`) y `pnpm run auditar-trace`.

## 1.5.2 — 13 de octubre de 2026

- **Tabla del trace más fácil de leer:** el cable, la cubierta o el equipo de cada fila se
  ven por su código (Cable 2102262, Cub nivel 1 CO19, ODF 1) con el símbolo del mapa, y el
  puerto por su nombre (Puerto E1); los UUID siguen enteros, en gris. Encabezado más
  liviano, la Suma con su unidad, la central con el símbolo de la cabecera, y la primera
  columna fija al desplazar la tabla en el celular. La fila resaltada se ve ámbar también
  en modo oscuro.

## 1.5.1 — 13 de octubre de 2026

- **Resaltado en ámbar:** lo ubicado desde la tabla del trace se resalta en ámbar con borde
  oscuro, en el mapa, la fila, el pin y la leyenda. Se eligió entre cuatro paletas (ámbar,
  fucsia, lima y tinta); el fucsia de la 1.5.0 era demasiado chillón.

## 1.5.0 — 13 de octubre de 2026

- **Trace hacia abajo con su tabla:** las mismas columnas, la Suma y **Exportar a Excel** que
  hacia arriba. Va del origen hasta la entrada del divisor de la cubierta siguiente, donde
  termina la caché; si sale de la central, la central va primero.
- **Código ubica de un hilo:** su número, en la bolita de su color, como en Gestión de hilos;
  «Elemento ubica» dice el buffer («Buffer 5») con el color del buffer.
- **Resaltado:** el pin de una fila deja el cable o la cubierta resaltados en fucsia en el
  mapa (antes era un destello que se perdía sobre el cian del recorrido), y la fila queda
  marcada con el mismo color. La leyenda lo explica. El fucsia se eligió midiendo cuál se
  distingue más de todo lo que ya pinta el mapa.

## 1.4.1 — 13 de octubre de 2026

Revisión de lo que se puede escribir o pegar en cada campo, y de lo que llega al servidor.

- **Nombre de un elemento:** lo pegado desde Excel o un correo queda en una sola línea, sin
  caracteres invisibles y con un tope de 80 caracteres (antes aceptaba 200 000 y quedaban
  como rótulo del mapa). Si se borra todo, al salir del campo vuelve el nombre que tenía.
- **Login:** un usuario con caracteres invisibles (saltos de línea, el carácter nulo, marcas
  que dan vuelta el texto) se rechaza con su aviso; el servidor no lee pedidos de más de
  10 KB.
- **Ubicación del mapa:** sin coordenadas o con coordenadas mal escritas ya no consulta el
  punto (0, 0) en Nominatim; la búsqueda de direcciones no le manda caracteres invisibles.
- **Campos:** cada buscador tiene un largo máximo acorde con lo que acepta el servidor.
- **Arreglos:** el color de un hilo no se caía con una posición rara de la base; el Excel no
  se rompía con una celda vacía o de más de 32 767 caracteres (el máximo de Excel).
- **Pruebas:** `pnpm run entradas` (también dentro de `pnpm verificar`).

## 1.4.0 — 10 de octubre de 2026

- **Seguridad:** Next.js 16.3.8. Cierra 3 vulnerabilidades críticas de la 16.2.6, entre
  ellas la ejecución remota de código en servidores con Windows.
- **Mapa:** el trace ya no queda debajo de la leyenda ni de la ficha del elemento; en modo
  oscuro el mapa base vuelve a oscurecerse (y el mapa se mueve más fluido sin aceleración
  gráfica).
- **Login:** el bloqueo por intentos fallidos ya no se salta con muchas peticiones a la vez.
- **Capas:** el mapa se lee por páginas y no se corta al pasar de 1000 cubiertas o cables.
- **Arreglos:** «Actualizar» mientras cargaba duplicaba todo; la Esc al medir borraba el
  rótulo anterior; los identificadores salían con separador de miles y el buscador no
  encontraba una cubierta por su id_legacy; abrir otra pestaña pedía la clave aunque la
  sesión siguiera; en pantalla completa las ventanas se abrían sin verse.
- **Login:** muestra la versión.

## 1.3.0 — 9 de octubre de 2026

- **Recorrido del hilo** desde Gestión de hilos («Hacia la fuente» / «Hacia abajo»): la
  ventana del trace muestra el hilo elegido y al cerrarla se vuelve a los hilos.
- **Trace hacia arriba:** tabla de elementos (puertos, hilos, contenedores y la central)
  con la suma de longitudes y **Exportar a Excel**; llega hasta la OLT cruzando los
  divisores; si el recorrido se abre en dos, muestra una ruta por camino con su aviso.
- **Ventana del trace** que se mueve y se minimiza; el mapa encuadra el recorrido en el
  espacio libre que deja.
- **Trace más rápido:** de hasta 2,5 s a unos 0,6 s.

## 1.2.0 — 8 de octubre de 2026

- **Trace desde la caché del ingeniero** (`tab_fiber.element_connection`) en vez de calcular
  cada vez: ruta `GET /api/traces/{sentido}/{id}`, línea cian, lista de pasos, cubiertas
  del recorrido marcadas y su leyenda.

## 1.1.0 — 6 y 7 de octubre de 2026

- **Ventanas de Red de fibra:** Enrutamiento de hilos, Cross connection (cargue de Excel),
  Redes/Nodo con las columnas del SIG anterior.
- **Recorrido del trace** (primera versión, con la función `fn_trace_conectividad_fina`).
- Detalles visuales del tablero y del login tras revisar todas las vistas.

## 1.0.0 — 5 de octubre de 2026

- Primera versión publicada en el servidor de la empresa: mapa de la red (cubiertas, cables
  y cabeceras), capa activa para editar, buscador, Gestión de hilos, Redes/Nodo, GPON,
  ventanas de planta interna y externa, y sesión en cookie.
