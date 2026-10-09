/**
 * Un archivo de Excel (.xlsx) de una sola hoja, armado aquí mismo y sin
 * librerías: un .xlsx es un zip con unos XML. Alcanza para exportar tablas
 * (título, encabezados en negrita con fondo, datos con bordes y una fila de
 * totales). Los números van como números, para que Excel los pueda sumar.
 */

export type CeldaXlsx = string | number | null

export type FilaXlsx = {
  celdas: CeldaXlsx[]
  /** `titulo` en negrita sin bordes; `encabezado` en negrita con fondo; `total` en negrita. */
  estilo?: "titulo" | "encabezado" | "dato" | "total"
}

export type HojaXlsx = {
  nombre: string
  /** Ancho de cada columna, en caracteres. */
  anchos?: number[]
  filas: FilaXlsx[]
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
function columna(indice: number): string {
  let n = indice + 1
  let letras = ""
  while (n > 0) {
    const resto = (n - 1) % 26
    letras = String.fromCharCode(65 + resto) + letras
    n = Math.floor((n - 1) / 26)
  }
  return letras
}

function celda(valor: CeldaXlsx, ref: string, estilo: FilaXlsx["estilo"]): string {
  const esNumero = typeof valor === "number" && Number.isFinite(valor)
  const s =
    estilo === "titulo"
      ? ESTILO.titulo
      : estilo === "encabezado"
        ? ESTILO.encabezado
        : estilo === "total"
          ? esNumero
            ? ESTILO.totalNumero
            : ESTILO.totalTexto
          : esNumero
            ? ESTILO.datoNumero
            : ESTILO.datoTexto
  if (valor === null || valor === "") return estilo === "titulo" ? "" : `<c r="${ref}" s="${s}"/>`
  if (esNumero) return `<c r="${ref}" s="${s}"><v>${valor}</v></c>`
  return `<c r="${ref}" s="${s}" t="inlineStr"><is><t xml:space="preserve">${escapar(String(valor))}</t></is></c>`
}

function hojaXml(hoja: HojaXlsx): string {
  const cols = hoja.anchos?.length
    ? `<cols>${hoja.anchos.map((a, i) => `<col min="${i + 1}" max="${i + 1}" width="${a}" customWidth="1"/>`).join("")}</cols>`
    : ""
  const filas = hoja.filas
    .map((f, i) => `<row r="${i + 1}">${f.celdas.map((v, j) => celda(v, `${columna(j)}${i + 1}`, f.estilo)).join("")}</row>`)
    .join("")
  return `${XML}<worksheet xmlns="${NS}">${cols}<sheetData>${filas}</sheetData></worksheet>`
}

const ESTILOS =
  `${XML}<styleSheet xmlns="${NS}">` +
  `<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>` +
  `<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>` +
  `<fill><patternFill patternType="solid"><fgColor rgb="FFDDEBF7"/><bgColor indexed="64"/></patternFill></fill></fills>` +
  `<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>` +
  `<border><left style="thin"><color auto="1"/></left><right style="thin"><color auto="1"/></right>` +
  `<top style="thin"><color auto="1"/></top><bottom style="thin"><color auto="1"/></bottom><diagonal/></border></borders>` +
  `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
  `<cellXfs count="7">` +
  `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>` +
  `<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>` +
  `<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>` +
  `<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"/>` +
  `<xf numFmtId="2" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>` +
  `<xf numFmtId="2" fontId="1" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1"/>` +
  `<xf numFmtId="0" fontId="1" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1"/>` +
  `</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`

/** Los archivos que forman el .xlsx. */
function partes(hoja: HojaXlsx): [string, string][] {
  const nombreHoja = escapar(hoja.nombre.replace(/[\\/?*[\]:]/g, " ").slice(0, 31) || "Hoja1")
  return [
    [
      "[Content_Types].xml",
      `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
        `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
        `<Default Extension="xml" ContentType="application/xml"/>` +
        `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
        `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
        `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
        `</Types>`,
    ],
    [
      "_rels/.rels",
      `${XML}<Relationships xmlns="${NS_PAQUETE}"><Relationship Id="rId1" Type="${NS_REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    ],
    [
      "xl/workbook.xml",
      `${XML}<workbook xmlns="${NS}" xmlns:r="${NS_REL}"><sheets><sheet name="${nombreHoja}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    ],
    [
      "xl/_rels/workbook.xml.rels",
      `${XML}<Relationships xmlns="${NS_PAQUETE}">` +
        `<Relationship Id="rId1" Type="${NS_REL}/worksheet" Target="worksheets/sheet1.xml"/>` +
        `<Relationship Id="rId2" Type="${NS_REL}/styles" Target="styles.xml"/></Relationships>`,
    ],
    ["xl/styles.xml", ESTILOS],
    ["xl/worksheets/sheet1.xml", hojaXml(hoja)],
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
