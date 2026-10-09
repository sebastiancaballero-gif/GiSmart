/**
 * Un archivo de Excel (.xlsx) de una sola hoja, armado aquí mismo y sin
 * librerías: un .xlsx es un zip con unos XML. Alcanza para exportar tablas
 * como se entregan: título, notas, encabezados en negrita con fondo y filtro
 * (o una tabla de Excel con su fila de totales),
 * datos con bordes, una fila de totales con su fórmula, las filas de arriba
 * fijas al bajar y la hoja lista para imprimir. Los números van como números,
 * para que Excel los pueda sumar.
 */

/** Una fórmula de Excel (sin el «=») con el valor que ya da, para que se vea aunque no se recalcule. */
export type FormulaXlsx = { formula: string; valor: number | null }

export type CeldaXlsx = string | number | null | FormulaXlsx

export type FilaXlsx = {
  celdas: CeldaXlsx[]
  /**
   * `titulo` grande en negrita; `nota` en cursiva gris; `encabezado` en
   * negrita con fondo; `dato` con bordes; `total` en negrita con fondo suave.
   */
  estilo?: "titulo" | "nota" | "encabezado" | "dato" | "total"
  /** Alto de la fila en puntos (una nota larga en una celda combinada no crece sola). */
  alto?: number
}

export type HojaXlsx = {
  nombre: string
  /** Ancho de cada columna, en caracteres. */
  anchos?: number[]
  filas: FilaXlsx[]
  /** Rangos que se combinan en una sola celda, como «A1:G1». */
  combinar?: string[]
  /** Cuántas filas de arriba quedan fijas al bajar (hasta el encabezado). */
  filasFijas?: number
  /** El rango con filtro en el encabezado, como «A4:G26». */
  filtro?: string
  /**
   * Un rango como tabla de Excel: filtro y orden en el encabezado, filas en
   * bandas y, con `totales`, una fila de totales que no se mezcla con los
   * datos al filtrar ni al ordenar. Va en lugar de `filtro`.
   */
  tabla?: TablaXlsx
  /** Para imprimir: horizontal y a lo ancho de una hoja. */
  horizontal?: boolean
}

export type TablaXlsx = {
  /** Sin espacios: «TraceHaciaArriba». Las fórmulas lo nombran así: `SUBTOTAL(109,TraceHaciaArriba[Longitud (m)])`. */
  nombre: string
  /** Del encabezado a la última fila (la de totales, si hay): «A5:G21». */
  rango: string
  /**
   * Lo que va en la fila de totales, columna por columna: un texto (la
   * etiqueta), `"suma"` (la celda lleva `SUBTOTAL(109,…)`) o nada.
   */
  totales?: (string | { suma: true } | null)[]
}

// Índices de los estilos de styles.xml (cellXfs).
const ESTILO = {
  normal: 0,
  titulo: 1,
  encabezado: 2,
  datoTexto: 3,
  datoNumero: 4,
  totalNumero: 5,
  totalTexto: 6,
  nota: 7,
} as const

const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
const NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
const NS_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
const NS_PAQUETE = "http://schemas.openxmlformats.org/package/2006/relationships"

const escapar = (texto: string) =>
  texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    // Caracteres de control que el XML no admite.
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")

/** «A», «B», …, «Z», «AA»… */
export function columna(indice: number): string {
  let n = indice + 1
  let letras = ""
  while (n > 0) {
    const resto = (n - 1) % 26
    letras = String.fromCharCode(65 + resto) + letras
    n = Math.floor((n - 1) / 26)
  }
  return letras
}

const esFormula = (valor: CeldaXlsx): valor is FormulaXlsx => typeof valor === "object" && valor !== null

function celda(valor: CeldaXlsx, ref: string, estilo: FilaXlsx["estilo"]): string {
  const esNumero = (typeof valor === "number" && Number.isFinite(valor)) || esFormula(valor)
  const s =
    estilo === "titulo"
      ? ESTILO.titulo
      : estilo === "nota"
        ? ESTILO.nota
        : estilo === "encabezado"
          ? ESTILO.encabezado
          : estilo === "total"
            ? esNumero
              ? ESTILO.totalNumero
              : ESTILO.totalTexto
            : esNumero
              ? ESTILO.datoNumero
              : ESTILO.datoTexto
  const sinBordes = estilo === "titulo" || estilo === "nota"
  if (esFormula(valor)) {
    const cache = valor.valor !== null && Number.isFinite(valor.valor) ? `<v>${valor.valor}</v>` : ""
    return `<c r="${ref}" s="${s}"><f>${escapar(valor.formula)}</f>${cache}</c>`
  }
  if (valor === null || valor === "") return sinBordes ? "" : `<c r="${ref}" s="${s}"/>`
  if (typeof valor === "number") return Number.isFinite(valor) ? `<c r="${ref}" s="${s}"><v>${valor}</v></c>` : `<c r="${ref}" s="${s}"/>`
  return `<c r="${ref}" s="${s}" t="inlineStr"><is><t xml:space="preserve">${escapar(String(valor))}</t></is></c>`
}

function hojaXml(hoja: HojaXlsx): string {
  const columnas = Math.max(1, hoja.anchos?.length ?? 0, ...hoja.filas.map((f) => f.celdas.length))
  const dimension = `<dimension ref="A1:${columna(columnas - 1)}${Math.max(1, hoja.filas.length)}"/>`
  const fijas = hoja.filasFijas ?? 0
  const vista =
    fijas > 0
      ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${fijas}" topLeftCell="A${fijas + 1}" activePane="bottomLeft" state="frozen"/>` +
        `<selection pane="bottomLeft" activeCell="A${fijas + 1}" sqref="A${fijas + 1}"/></sheetView></sheetViews>`
      : `<sheetViews><sheetView workbookViewId="0"/></sheetViews>`
  const cols = hoja.anchos?.length
    ? `<cols>${hoja.anchos.map((a, i) => `<col min="${i + 1}" max="${i + 1}" width="${a}" customWidth="1"/>`).join("")}</cols>`
    : ""
  const filas = hoja.filas
    .map((f, i) => {
      // El título, un poco más alto para su letra grande.
      const puntos = f.alto ?? (f.estilo === "titulo" ? 21 : null)
      const alto = puntos ? ` ht="${puntos}" customHeight="1"` : ""
      return `<row r="${i + 1}"${alto}>${f.celdas.map((v, j) => celda(v, `${columna(j)}${i + 1}`, f.estilo)).join("")}</row>`
    })
    .join("")
  const filtro = hoja.filtro ? `<autoFilter ref="${hoja.filtro}"/>` : ""
  const combinadas = hoja.combinar?.length
    ? `<mergeCells count="${hoja.combinar.length}">${hoja.combinar.map((r) => `<mergeCell ref="${r}"/>`).join("")}</mergeCells>`
    : ""
  const impresion = hoja.horizontal
    ? `<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/>` +
      `<pageSetup paperSize="1" orientation="landscape" fitToWidth="1" fitToHeight="0"/>`
    : `<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>`
  const ajustar = hoja.horizontal ? `<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>` : ""
  // El orden de las partes lo fija el esquema de Excel.
  const tablas = hoja.tabla ? `<tableParts count="1"><tablePart r:id="rId1"/></tableParts>` : ""
  return `${XML}<worksheet xmlns="${NS}" xmlns:r="${NS_REL}">${ajustar}${dimension}${vista}${cols}<sheetData>${filas}</sheetData>${filtro}${combinadas}${impresion}${tablas}</worksheet>`
}

const ESTILOS =
  `${XML}<styleSheet xmlns="${NS}">` +
  `<fonts count="4"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font>` +
  `<font><b/><sz val="14"/><name val="Calibri"/></font><font><i/><sz val="10"/><color rgb="FF595959"/><name val="Calibri"/></font></fonts>` +
  `<fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>` +
  `<fill><patternFill patternType="solid"><fgColor rgb="FFDDEBF7"/><bgColor indexed="64"/></patternFill></fill>` +
  `<fill><patternFill patternType="solid"><fgColor rgb="FFF2F2F2"/><bgColor indexed="64"/></patternFill></fill></fills>` +
  `<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>` +
  `<border><left style="thin"><color auto="1"/></left><right style="thin"><color auto="1"/></right>` +
  `<top style="thin"><color auto="1"/></top><bottom style="thin"><color auto="1"/></bottom><diagonal/></border></borders>` +
  `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
  `<cellXfs count="8">` +
  `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>` +
  `<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>` +
  `<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>` +
  `<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"/>` +
  `<xf numFmtId="4" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>` +
  `<xf numFmtId="4" fontId="1" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>` +
  `<xf numFmtId="0" fontId="1" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>` +
  `<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>` +
  `</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`

/** El nombre de la hoja como lo admite Excel: sin \ / ? * [ ] : y hasta 31 caracteres. */
const nombreDeHoja = (nombre: string) => nombre.replace(/[\\/?*[\]:]/g, " ").slice(0, 31).trim() || "Hoja1"

/** Un rango «A4:G26» con el nombre de la hoja y en absoluto, como lo guarda Excel. */
function rangoAbsoluto(hoja: string, rango: string): string {
  const absoluto = rango
    .split(":")
    .map((ref) => ref.replace(/^([A-Z]+)(\d+)$/, "$$$1$$$2"))
    .join(":")
  return `'${hoja.replace(/'/g, "''")}'!${absoluto}`
}

/** La parte de la tabla de Excel: sus columnas salen del encabezado de la hoja. */
function tablaXml(hoja: HojaXlsx, tabla: TablaXlsx): string {
  const [desde, hasta] = tabla.rango.split(":")
  const filaDe = (ref: string) => Number(ref.replace(/^[A-Z]+/, ""))
  const encabezado = hoja.filas[filaDe(desde) - 1]?.celdas ?? []
  const conTotales = tabla.totales !== undefined
  const ultimaDeDatos = conTotales ? `${hasta.replace(/\d+$/, "")}${filaDe(hasta) - 1}` : hasta
  const columnas = encabezado.map((nombre, i) => {
    const total = tabla.totales?.[i]
    const extra =
      typeof total === "string" ? ` totalsRowLabel="${escapar(total)}"` : total ? ` totalsRowFunction="sum"` : ""
    return `<tableColumn id="${i + 1}" name="${escapar(String(nombre ?? `Columna ${i + 1}`))}"${extra}/>`
  })
  return (
    `${XML}<table xmlns="${NS}" id="1" name="${tabla.nombre}" displayName="${tabla.nombre}" ref="${tabla.rango}"` +
    `${conTotales ? ` totalsRowCount="1"` : ""}>` +
    `<autoFilter ref="${desde}:${ultimaDeDatos}"/>` +
    `<tableColumns count="${columnas.length}">${columnas.join("")}</tableColumns>` +
    `<tableStyleInfo name="TableStyleLight1" showFirstColumn="0" showLastColumn="0" showRowStripes="1" showColumnStripes="0"/></table>`
  )
}

/** Los archivos que forman el .xlsx. */
function partes(hoja: HojaXlsx): [string, string][] {
  const limpio = nombreDeHoja(hoja.nombre)
  const nombreHoja = escapar(limpio)
  // El filtro del encabezado, como lo guarda Excel: un nombre oculto con su rango.
  const nombres = hoja.filtro
    ? `<definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">${escapar(rangoAbsoluto(limpio, hoja.filtro))}</definedName></definedNames>`
    : ""
  return [
    [
      "[Content_Types].xml",
      `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
        `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
        `<Default Extension="xml" ContentType="application/xml"/>` +
        `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
        `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
        `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
        (hoja.tabla
          ? `<Override PartName="/xl/tables/table1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.table+xml"/>`
          : "") +
        `</Types>`,
    ],
    [
      "_rels/.rels",
      `${XML}<Relationships xmlns="${NS_PAQUETE}"><Relationship Id="rId1" Type="${NS_REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    ],
    [
      "xl/workbook.xml",
      `${XML}<workbook xmlns="${NS}" xmlns:r="${NS_REL}"><sheets><sheet name="${nombreHoja}" sheetId="1" r:id="rId1"/></sheets>${nombres}</workbook>`,
    ],
    [
      "xl/_rels/workbook.xml.rels",
      `${XML}<Relationships xmlns="${NS_PAQUETE}">` +
        `<Relationship Id="rId1" Type="${NS_REL}/worksheet" Target="worksheets/sheet1.xml"/>` +
        `<Relationship Id="rId2" Type="${NS_REL}/styles" Target="styles.xml"/></Relationships>`,
    ],
    ["xl/styles.xml", ESTILOS],
    ["xl/worksheets/sheet1.xml", hojaXml(hoja)],
    ...((hoja.tabla
      ? [
          [
            "xl/worksheets/_rels/sheet1.xml.rels",
            `${XML}<Relationships xmlns="${NS_PAQUETE}"><Relationship Id="rId1" Type="${NS_REL}/table" Target="../tables/table1.xml"/></Relationships>`,
          ],
          ["xl/tables/table1.xml", tablaXml(hoja, hoja.tabla)],
        ]
      : []) as [string, string][]),
  ]
}

// --- Zip sin compresión («stored»): basta para un .xlsx y no necesita librerías.

const TABLA_CRC = (() => {
  const tabla = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    tabla[n] = c >>> 0
  }
  return tabla
})()

function crc32(datos: Uint8Array): number {
  let c = 0xffffffff
  for (const b of datos) c = TABLA_CRC[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function zip(archivos: [string, Uint8Array][], fecha: Date): Uint8Array {
  const hora = (fecha.getHours() << 11) | (fecha.getMinutes() << 5) | Math.floor(fecha.getSeconds() / 2)
  const dia = ((Math.max(fecha.getFullYear(), 1980) - 1980) << 9) | ((fecha.getMonth() + 1) << 5) | fecha.getDate()
  const codificador = new TextEncoder()
  const locales: Uint8Array[] = []
  const centrales: Uint8Array[] = []
  let desplazamiento = 0
  for (const [nombre, datos] of archivos) {
    const nombreBytes = codificador.encode(nombre)
    const crc = crc32(datos)
    const local = new Uint8Array(30 + nombreBytes.length)
    const vl = new DataView(local.buffer)
    vl.setUint32(0, 0x04034b50, true)
    vl.setUint16(4, 20, true)
    vl.setUint16(6, 0x0800, true) // nombres en UTF-8
    vl.setUint16(8, 0, true) // sin compresión
    vl.setUint16(10, hora, true)
    vl.setUint16(12, dia, true)
    vl.setUint32(14, crc, true)
    vl.setUint32(18, datos.length, true)
    vl.setUint32(22, datos.length, true)
    vl.setUint16(26, nombreBytes.length, true)
    vl.setUint16(28, 0, true)
    local.set(nombreBytes, 30)

    const central = new Uint8Array(46 + nombreBytes.length)
    const vc = new DataView(central.buffer)
    vc.setUint32(0, 0x02014b50, true)
    vc.setUint16(4, 20, true)
    vc.setUint16(6, 20, true)
    vc.setUint16(8, 0x0800, true)
    vc.setUint16(10, 0, true)
    vc.setUint16(12, hora, true)
    vc.setUint16(14, dia, true)
    vc.setUint32(16, crc, true)
    vc.setUint32(20, datos.length, true)
    vc.setUint32(24, datos.length, true)
    vc.setUint16(28, nombreBytes.length, true)
    vc.setUint32(42, desplazamiento, true)
    central.set(nombreBytes, 46)

    locales.push(local, datos)
    centrales.push(central)
    desplazamiento += local.length + datos.length
  }
  const tamanoCentral = centrales.reduce((s, c) => s + c.length, 0)
  const fin = new Uint8Array(22)
  const vf = new DataView(fin.buffer)
  vf.setUint32(0, 0x06054b50, true)
  vf.setUint16(8, archivos.length, true)
  vf.setUint16(10, archivos.length, true)
  vf.setUint32(12, tamanoCentral, true)
  vf.setUint32(16, desplazamiento, true)

  const total = new Uint8Array(desplazamiento + tamanoCentral + fin.length)
  let i = 0
  for (const parte of [...locales, ...centrales, fin]) {
    total.set(parte, i)
    i += parte.length
  }
  return total
}

/** El .xlsx de esa hoja, listo para descargar. */
export function crearXlsx(hoja: HojaXlsx, fecha = new Date()): Uint8Array {
  const codificador = new TextEncoder()
  return zip(
    partes(hoja).map(([nombre, contenido]) => [nombre, codificador.encode(contenido)]),
    fecha,
  )
}

export const TIPO_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

/** Descarga esos datos con ese nombre de archivo (en el navegador). */
export function descargarArchivo(datos: Uint8Array, nombre: string, tipo = TIPO_XLSX) {
  const url = URL.createObjectURL(new Blob([datos as BlobPart], { type: tipo }))
  const enlace = document.createElement("a")
  enlace.href = url
  enlace.download = nombre
  document.body.appendChild(enlace)
  enlace.click()
  enlace.remove()
  // Un momento después: algunos navegadores todavía leen la URL al empezar la descarga.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
