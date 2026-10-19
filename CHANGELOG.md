# Versiones de GISmart

La versión que se ve en el login sale de `package.json` (ver `lib/version.ts`); al pasar
el mouse sobre ella se ve el commit desde el que se compiló. Cada cambio importante sube la
versión y se anota aquí.

- **El número del medio** sube con cada cambio importante: una función o ventana nueva, o
  una mejora que se note al usarla (1.4.0 → 1.5.0).
- **El último** sube con arreglos que no cambian cómo se usa (1.5.0 → 1.5.1).
- **El primero** sube con cambios grandes que piden algo nuevo de la base o del servidor
  (1.x → 2.0.0).

## 1.12.1 — 19 de octubre de 2026

Revisión de lo último antes de entregar la versión.

- **Conectividad fina sin fusiones:** con las funciones nuevas por nivel (`_n0`, `_n12`)
  el esquema abría con los cables pero sin ninguna fusión, porque llegan sueltas y no
  dentro de bandejas. Ahora se leen: en las 185 cubiertas se dibujan 561 de las 562
  fusiones entre hilos (la otra repite un hilo ya empalmado y lo avisa).
- **Fusiones que no cabían:** cuando la base registra menos bandejas de las que piden sus
  fusiones (0 en las de empalme; 2 de 12 fusiones en varias de primer nivel, como CO02),
  se dibujan las que hacen falta y se avisa. Antes se perdían 113 fusiones en 9 cubiertas.
- **Avisos del esquema:** las conexiones con un puerto de divisor (que el esquema todavía no
  dibuja) se cuentan en un solo aviso, en vez de un «el hilo de origen undefined no existe»
  por conexión.
- **Trace:** la base renombró los tipos de puerto (`DIV_N1`, `DIV_N2`, `TJT_OLT`,
  `BDJ_ODF`) y el trace hacia arriba se quedaba en la salida del divisor de primer nivel,
  sin llegar a la OLT; la tabla decía «DIV_N1» sin el divisor ni su cubierta. Ahora los
  reconoce por familia: los 1762 recorridos de la caché cuadran con la base y 892 de 898
  rutas hacia arriba llegan a la OLT.
- **Sección distribución:** el buscador también encuentra por cubierta («CO06»), por
  equipo destino («NAP 13/14») y por identificador; el identificador, también en la
  sección feeder.

## 1.12.0 — 15 de octubre de 2026

**Animaciones en todo el sistema** y el **Asistente IA** probado con una clave real de
Gemini.

Animaciones (todas con CSS, cortas, solo de opacidad y posición: el mapa sigue a 116–118
cuadros por segundo; con «reducir movimiento» en el sistema, todo queda quieto):

- **Cinta**:
  - El subrayado de la pestaña elegida crece desde el centro y sus grupos de herramientas
    aparecen uno tras otro.
  - Los botones se hunden al pulsarlos y su ícono sube un poco al pasar el ratón.
- **Herramientas del mapa**: se hunden al pulsarlas y el ícono de la elegida gira al
  encenderse.
- **Capas**:
  - Los contadores (185, 182…) y la fibra total dan un saltito al cargar o cambiar.
  - El ojo gira al mostrar u ocultar una capa.
  - El desglose aparece en cascada.
- **Ficha** de un elemento: entra desde la derecha; sus secciones aparecen una tras otra, y
  otra vez al elegir otro elemento.
- **Resumen y Cercanía**: entran desde la izquierda, que es donde están.
- **Avisos del mapa**: bajan desde arriba con un impulso.
- **Leyenda**: el contenido se despliega deslizándose.
- **Tablas** (atributos, trace, hilos, redes por nodo, información): las primeras filas
  entran en cascada al abrir o al cambiar de capa. Ordenar no las vuelve a animar.
- La leyenda ya no se oculta con Resumen o Cercanía abiertos; solo se aparta con la ficha,
  que es la que la tapa.

Navegar y ver (Avanzado › Navegar y Vista), tomadas de RustGIS:

- **Anterior / Siguiente**: vuelve a la vista de antes del último movimiento o acercamiento,
  como atrás y adelante en el navegador (hasta 50 vistas).
- **Recuadro**: se arrastra un recuadro sobre el mapa y se acerca justo a esa zona (Esc
  cancela).
- **Minimapa**: un mapa chico abajo a la izquierda con las calles, la red y el recuadro de
  lo que se ve; arrastrar el recuadro mueve el mapa.
- **Mapa base**: el fondo según el tema, de calles, gris (la red resalta más), oscuro o sin
  fondo, con una miniatura de cada uno, y la **transparencia de cada capa** (mapa base,
  zonas, fibra, cubiertas y cabeceras). Salen de las mismas teselas, sin otro proveedor.
- **Copiar mapa**: la lámina de Imprimir al portapapeles, para pegarla en WhatsApp o en un
  correo con Ctrl+V; si el navegador no deja copiar, se descarga como PNG.
- El fondo, las transparencias y el minimapa se recuerdan por usuario en cada equipo.

Imprimir:

- **Sale el fondo del mapa** (calles, parques, nombres de vías) detrás de la red. Antes la
  lámina salía en blanco porque la captura no incluía la capa del mapa base. Con la casilla
  «Fondo del mapa» se puede quitar para ahorrar tinta. Con el fondo, el pie lleva
  «© OpenStreetMap», como exige su licencia.

Asistente IA:

- **Respuestas concretas**:
  - La respuesta va en la primera línea, con el dato en negrita, sin introducciones ni datos
    que no se pidieron.
  - Con las mismas 8 preguntas de prueba, de 580 palabras en total a 106 (82 % menos), todas
    correctas.
  - Los pasos de GISmart salen de la ayuda real; ya no inventa clics.
  - Temperatura baja para que no divague.
- **Diseño nuevo**, como los asistentes conocidos:
  - Al empezar, saludo con el nombre y cuatro tarjetas de ejemplo.
  - Las preguntas van en burbuja; las respuestas, como texto con el avatar al lado.
  - Bajo cada respuesta: copiar, repetir y lo que consultó, como fuentes.
  - Mientras piensa, el paso en curso con un brillo y un botón para detener.
  - La caja de escritura crece con el texto y el botón de enviar va adentro.
  - El panel se puede ampliar. Hay botón para ir al final y «Reintentar» en los errores.
  - El ícono tiene vida, sin exagerar: un reflejo de luz lo cruza cada tanto, la chispa
    titila suave y gira al pasar el ratón; el del inicio flota apenas, con una órbita tenue y
    unos pocos destellos. Mientras piensa, un halo de colores suave gira detrás.
- **Muestra en vivo lo que consulta** («Leyendo la ficha de CO19…», «Recorriendo el trace…»),
  con los pasos hechos marcados, en vez de esperar a ciegas.
- **Nombres clicables**: CO19, un código de cable, 13/14… llevan el mapa al elemento y abren su
  ficha. Los nombres repetidos (hay varias «N1» y «3-abr») no, porque no hay a cuál llevar.
- **Tablas, listas numeradas y títulos** en las respuestas.
- **Sugerencias de seguimiento**: 2 o 3 preguntas para seguir debajo de la última respuesta.
- **Ayuda de GISmart**: «¿cómo hago un trace?» → Red de fibra › Reportes › Trace.
- **Cercanía**: «¿qué cubierta queda más cerca de la Carrera 14?», de una coordenada o de una
  cubierta. Marca el punto con un círculo en el mapa y avisa si la dirección es aproximada.
- **Desde Ctrl+K**: lo escrito se puede preguntar al asistente (primera opción si parece una
  pregunta). **Ctrl+I** abre y cierra el asistente.
- El total de fibra que da el asistente se mide como en el mapa: decía 18,75 km y la pantalla
  18,73.

- Respondía «Gemini respondió con un error (503)»: Google tenía saturado el modelo. Ahora
  reintenta (a los 1,5 s y a los 3 s) y, si sigue saturado o sin cuota, pasa a otro modelo;
  la conversación sigue sin perder lo dicho. Debajo de la respuesta dice si contestó un
  modelo de respaldo. Si fallan todos, el mensaje lo explica en palabras.
- Modelo por defecto **gemini-3.5-flash-lite**, con respaldo gemini-3.1-flash-lite y
  gemini-3.8-flash. En las pruebas el 3.5 lite contestó bien (también el trace de un hilo)
  en 3–8 s por pregunta; el 3.8 tardaba 12–44 s, se saturaba a ratos y su cuota gratuita se
  acaba enseguida. Se cambian con `GEMINI_MODEL` y `GEMINI_MODELOS_RESPALDO`.
- Pide pensar poco a Gemini: antes gastaba cientos de tokens en pensar una pregunta simple.
- «Selecciona las cubiertas de primer nivel» se quedaba sin consultas (buscaba de a 12 por
  nombre). Ahora busca y selecciona por nivel; entran también las de empalme, que no tienen
  etiqueta en la base.
- Dice siempre «cubierta», nunca «mufa».
- **Animaciones**:
  - El panel entra desde la derecha y las burbujas llegan con un impulso.
  - Mientras consulta, tres puntos saltan junto a un estado que va cambiando («Pensando…»,
    «Consultando la red…»); el robot echa ondas y la franja de arriba corre. Si tarda, lo
    dice.
  - La respuesta se escribe sola, palabra por palabra (un click la muestra entera). Al
    terminar aparecen, con un saltito, fichas de lo que mostró en el mapa («Mapa en CO19»,
    «Trace hacia la fuente»…).
  - Están hechas con CSS, sin librerías, y con «reducir movimiento» en el sistema la
    respuesta sale entera y quieta.
- Con el asistente abierto, la leyenda ya no se oculta en pantallas bajas: el panel usaba la
  animación de la ficha, que la escondía.

**Gestión de hilos: «Sección distribución»** (Red de fibra → Hilos), como en el SIG anterior:

- La pestaña «Sección troncal» se llama ahora **«Sección feeder»**, y a su lado está la nueva
  **«Sección distribución»**.
- Por cada hilo del cable muestra Identificador, Número, **Cubierta nivel 1** (antes «CEO
  Origen»), Divisor, Pto divisor, **Salida** (antes «Salida CEO») y Equipo destino.
- La salida numera seguidas las salidas de los divisores de la cubierta: con divisores 1x8,
  el puerto 1 del divisor 2 es la salida 9, como la daba el SIG anterior.
- El equipo destino es donde termina el hilo hacia abajo: «NAP 13/14» (una cubierta de
  segundo nivel), «Divisor 1 de CO05» (un hilo del feeder) o «Sin conectar».
- No hay función de la base para esto: sale de la caché del trace, en
  `GET /api/cables/{id}/distribucion`. Tarda alrededor de un segundo y se pide al abrir la
  pestaña. Comparte el filtro por buffer, la búsqueda y el hilo elegido con la otra pestaña.

**Conectividad fina con las funciones nuevas por nivel**:

- Consultar cualquier cubierta daba error: la base ya no tiene
  `get_json_conectividad_cubierta` (PGRST202).
- Ahora se lee el `nivel` de la cubierta y se llama a la función que le toca:
  `get_json_conectividad_cubierta_n0` para las de empalme (nivel 0) y
  `get_json_conectividad_cubierta_n12` para las de primer y segundo nivel.
- Probado con las 185 cubiertas: 184 se dibujan y 1 no tiene cables.
- Si falla, la línea de detalle del aviso nombra la función que se usó.

## 1.11.1 — 15 de octubre de 2026

Para que funcione en el servidor de producción, que tiene un Node anterior al 20. Ahora
basta **Node 18.18 o más nuevo**. Probado instalando, compilando y arrancando con Node
18.18.0: login, capas (185 cubiertas, 182 cables), conectividad, hilos, trace y el
tablero completo.

- **Next 15.5.28** en vez de 16.3.8 (Next 16 pide Node 20.9). Se eligió la 15.5 y no la
  14.2: toda la línea 14 tiene una falla crítica de ejecución remota de código en
  servidores Windows que ya no se va a corregir; la 15.5.28 no tiene fallas conocidas.
  React sigue en la 19.
- **Supabase 2.78.0** (desde la 2.79 pide Node 20 y desde la 2.110, Node 22).
- **Tailwind 4.1.18** (desde la 4.2 su compilador pide Node 20). Se comparó el CSS clase por
  clase con el de la 4.3.3: es el mismo.
- **pnpm 10** en vez de 11, que pide Node 22.13: con un Node viejo, `pnpm install` ni
  arrancaba.
- La conexión a la base usaba `AbortSignal.any`, que no existe antes de Node 20.3; ahora,
  si no está, combina las señales a mano.
- El lint conserva las reglas estrictas de hooks que traía Next 16.

## 1.11.0 — 15 de octubre de 2026

Quinta y última parte del módulo **Avanzado**.

- **Asistente IA** (Avanzado › Asistente IA): se le pregunta en palabras propias sobre la
  red («¿qué cables llegan a CO19?», «¿cuántos hilos del cable 2102262 están
  conectados?», «haz el trace hacia arriba del hilo 5») y responde con los datos de la
  base: busca cubiertas y cables, lee la ficha de una cubierta o de un cable con sus
  hilos, resume la red y recorre el trace. También puede llevar el mapa a lo que
  encuentra, seleccionar varias cubiertas o cables (quedan en la tabla de atributos) o
  abrir la ventana del trace con el recorrido. Solo consulta: no cambia nada de la red.
  Abajo de cada respuesta dice qué consultó.
- El panel va a la derecha, a todo lo alto, y el mapa se angosta para dejarle espacio: la
  ficha y la leyenda siguen a la vista.
- Usa Gemini (Google). La clave va solo en el servidor, en `.env.local` (`GEMINI_API_KEY`,
  y si se quiere otro modelo, `GEMINI_MODEL`); sin ella el panel dice que falta
  configurarlo. Lo que se pregunta y los datos que consulta se envían a Google. Cada
  usuario tiene hasta 40 preguntas por hora.
- Al elegir con «Consultar» con la tabla cerrada, el mapa ahora encuadra lo elegido después
  de abrirse la tabla (antes podía quedar debajo de ella).

## 1.10.0 — 15 de octubre de 2026

Cuarta parte del módulo **Avanzado**.

- **Cercanía** (Avanzado › Cercanía): lo que hay a cierta distancia (100 m, 300 m, 500 m,
  1 km o la que se escriba) de un punto que se elige con un click o de la cubierta que
  está en la ficha. Dibuja el círculo en el mapa y lista las cubiertas, los cables y las
  cabeceras de lo más cerca a lo más lejos, con su distancia (en un cable, al punto más
  cercano de su línea). Cada resultado lleva el mapa a ese elemento, y cada grupo se puede
  pasar a la tabla de atributos ya seleccionado. Sirve, por ejemplo, para ver qué
  cubiertas quedan cerca de un cliente nuevo.
- **Imprimir** (Avanzado › Imprimir): el mapa tal como se ve (con el trace, la selección o
  el círculo, si están) en una lámina con título, lugar, leyenda, escala, norte y fecha.
  Se descarga como imagen o se manda a la impresora, donde también se guarda como PDF.

## 1.9.0 — 15 de octubre de 2026

Tercera parte del módulo **Avanzado**.

- **Tabla de atributos** (Avanzado › Tabla): la tabla de cubiertas, cables o cabeceras se
  abre debajo del mapa, que se achica para que se vean los dos. Solo trae las columnas que
  tienen datos, con las referencias por nombre (el cable va «de CO19 a 13/14», no por
  UUID) y la longitud de cada cable. Se ordena por cualquier columna, se busca dentro, se
  puede ver «solo lo que se ve» en el mapa o «solo lo seleccionado», y se exporta a Excel
  tal como está. Click elige una fila, Ctrl+click suma, Mayús+click un tramo; lo elegido se
  resalta en ámbar en el mapa y un botón lleva el mapa hasta ello. Doble click (o el pin)
  abre la ficha. El borde de arriba se arrastra para cambiar el alto.
- **Seleccionar por atributos** (Avanzado › Consultar, o el filtro de la tabla): condiciones
  de campo, operador y valor («Cantidad de hilos es igual a 144», «Función contiene
  nivel»), unidas por «todas» o «alguna», con los valores que ya existen como sugerencia.
  Antes de aplicar dice cuántos coinciden; al aplicar, lo que coincide queda seleccionado
  (nueva selección, sumar, quitar o dentro de la selección) y la tabla muestra la consulta.
- Con el mapa más bajo, la barra de herramientas y la leyenda se desplazan en vez de tapar
  la escala o el zoom.

## 1.8.0 — 15 de octubre de 2026

Segunda parte del módulo **Avanzado**.

- **Resumen de lo que se ve** (Avanzado › Resumen): un panel con lo que hay en pantalla,
  en cifras y con barras: cubiertas por nivel, kilómetros de fibra por capacidad de cable
  (solo lo que cae dentro de la pantalla, no el largo entero de cada cable que asoma) y
  cabeceras. Se rehace solo al mover el mapa, filtrar o encender una capa, y dice cuántos
  elementos no cuenta porque su capa está apagada o el filtro los oculta. Con toda la red a
  la vista coincide con el panel de capas (185 cubiertas, 18,73 km).
- **Ficha «1 de N»**: al identificar un punto donde hay varios elementos (una cubierta y
  los cables que llegan a ella), la ficha dice cuántos hay y deja pasar de uno a otro con
  las flechas. Antes solo se veía el de encima.

## 1.7.0 — 15 de octubre de 2026

Primera parte del módulo **Avanzado**: lo nuevo que se suma al SIG, en su propia pestaña de
la cinta y en su propia carpeta (`modulos/avanzado`), sin tocar lo que ya funcionaba.
Las ideas salen de revisar RustGIS; las que todavía no están se ven como «próximamente».

- **Funciones en Ctrl+K:** el buscador también encuentra los botones de la cinta por su
  nombre o por lo que hacen («trace», «distancia», «gestión de hilos») y dice dónde están
  («Red de fibra › Reportes»). Al elegir una, hace lo mismo que su botón y deja esa pestaña
  a la vista.
- **Marcadores:** guardar la vista del mapa con un nombre («HUB La Unión») y volver a ella
  con un click. Se pueden renombrar y borrar; se guardan en el navegador, por usuario.
- **Atajos:** la ventana de atajos de teclado («?») ahora también se abre desde la cinta.

## 1.6.1 — 14 de octubre de 2026

Retoques de vistas en el celular, tras revisar todas las pantallas en 1366×768,
1366×657 y 390×844.

- **Panel de capas en el celular:** abierto flota sobre el mapa. Antes lo empujaba y el
  mapa quedaba de 100 px, con el zoom encima de las herramientas.
- **Ventanas en el celular:** la frase bajo el título usa hasta dos líneas; en una se
  cortaba a la mitad en ocho ventanas («Qué puerto de cada tarjeta de la OLT lle…»).
- **Redes/Nodo en el celular:** «Nodo elegido» se lee entero; el botón «Cargar
  cubiertas» pasa a la línea de abajo.

## 1.6.0 — 14 de octubre de 2026

Pruebas repartidas en cinco frentes (ventana del trace, tablero, seguridad, datos y
código) y lo que salió de ellas.

- **Trace desde Gestión de hilos en 1366×768:** la ficha del cable tapaba el único espacio
  libre junto a la ventana y el recorrido no se veía. Ahora la ficha se cierra al pintarlo.
  En 1366×657 la ventana ocupa casi todo el mapa: se minimiza para verlo.
- **Recorridos que se abren en ramas:** los pasos y la atenuación son los de la ruta
  elegida, en la ventana y en el Excel (antes eran los del recorrido entero).
- **Lista de pasos:** incluye los tramos que siguen después de un divisor, numerados
  seguido y con la atenuación acumulada de todo el camino.
- **Sin recorrido, por qué:** la salida de un divisor sugiere su entrada solo si desde
  ella se sube; la entrada de un divisor nombra las salidas que sí bajan; un hilo dice de
  qué cable es. Si la base falla al averiguarlo, esa respuesta no se guarda.
- **Origen del trace:** acepta `urn:uuid:`, el UUID sin guiones, con punto y coma al final
  o con caracteres invisibles pegados de un correo. Un texto que no es UUID quita el
  recorrido anterior. El detalle de un error dice la consulta que falló.
- **Ventana del trace:** no salta al cambiar el tamaño de la pantalla; si el sistema
  cancela un arrastre, vuelve a su lugar; un recorrido pedido desde Hilos no sale si la
  ventana se cierra antes. La «Suma» queda fija al desplazar la tabla de lado, el hilo
  elegido se lee entero y, hacia abajo, dice de qué central sale (también en el Excel).
- **Pin de un cable:** un cable corto se acerca hasta verse; antes solo se alejaba.
- **Excel del trace:** «Número» va como número (ordena el 2 antes que el 10) y los
  caracteres que Excel rechazaba ya no dañan la hoja.
- **Gestión de hilos:** en el celular y en 1366×657 la tabla quedaba de 2 px de alto;
  ahora guarda su alto y la ventana se desplaza.
- **Buscador:** las direcciones de alrededor del mapa salen primero y sin repetidas; una
  coordenada escrita al revés se entiende (gana la lectura que cae en Colombia) y una
  imposible se avisa en vez de buscarse como dirección. «Ctrl K» ya no tapa lo escrito.
- **Panel de capas:** con un filtro puesto, la cifra «21/185» es el botón que lo quita, y
  el nombre de la capa ya no se corta.
- **Botones pendientes:** «Generar reporte» y «Cargar cubiertas» se ven como pendientes;
  en azul parecían funcionar.
- **Nombres con emojis:** los compuestos (familias, banderas) no se parten y el tope de
  80 caracteres no corta uno por la mitad.
- **Seguridad:** el login y el logout rechazan las peticiones que manda otra web; el
  cuerpo del login se lee con tope también cuando llega por partes (256 MB ocupaban 1 GB
  de memoria); mandar miles de nombres inventados ya no desbloquea una cuenta; un
  secreto débil en producción se detecta antes de consultar la base; las respuestas de
  `/api` llevan `Cache-Control: private, no-store`.
- **Base que no responde:** la carga de capas desde las tablas también se corta a los
  15 s; si el catálogo del trace no se puede leer, se reintenta a los 30 s y no en cada
  trace; el mensaje distingue tiempo agotado, sin conexión y los demás errores.
- **`pnpm run datos`:** avisa cuando no pudo comprobar el sentido de los cables.

## 1.5.6 — 14 de octubre de 2026

- **El hilo elegido en el trace:** dice el identificador del cable («Hilo 55 del cable
  01a0e04f-…»), el mismo de la columna «Identificador contenedor»; el código (2102262) sale
  al pasar el mouse. El título del Excel también; el nombre del archivo sigue con el código.

## 1.5.5 — 14 de octubre de 2026

- **Tabla del trace con los nombres que pidieron:** Tipo elemento, Identificador elemento,
  Número, Elemento ubica, Longitud, Contenedor e Identificador contenedor. «Número» es la
  que se llamaba «Código ubica» y ahora va antes de «Elemento ubica». Igual en el Excel.

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
