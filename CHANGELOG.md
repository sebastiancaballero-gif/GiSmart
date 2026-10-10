# Versiones de GISmart

La versión que se ve en el login sale de `package.json` (ver `lib/version.ts`); al pasar
el mouse sobre ella se ve el commit desde el que se compiló. Cada cambio importante sube la
versión y se anota aquí.

- **El número del medio** sube con cada cambio importante: una función o ventana nueva, o
  una mejora que se note al usarla (1.4.0 → 1.5.0).
- **El último** sube con arreglos que no cambian cómo se usa (1.5.0 → 1.5.1).
- **El primero** sube con cambios grandes que piden algo nuevo de la base o del servidor
  (1.x → 2.0.0).

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
