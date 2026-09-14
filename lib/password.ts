import { createHash, randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto"
import { promisify } from "node:util"

// `promisify` elige la sobrecarga de tres argumentos, así que se declara la
// que admite opciones de coste.
const scryptAsync = promisify(scrypt) as (
  clave: string | Buffer,
  sal: string | Buffer,
  largo: number,
  opciones: ScryptOptions,
) => Promise<Buffer>

/**
 * Hash de contraseñas con scrypt.
 *
 * Se usa `scrypt` de Node en vez de bcrypt o argon2 porque **no añade
 * dependencias**: viene en el propio Node. Eso importa aquí, donde el
 * despliegue es un servidor Windows y los módulos nativos son la fuente
 * habitual de problemas de instalación. scrypt es memory-hard, así que
 * encarece los ataques por fuerza bruta con hardware dedicado.
 *
 * Formato guardado (autodescriptivo, para poder subir el coste más adelante
 * sin invalidar lo ya almacenado):
 *
 *     scrypt$16384$8$1$<salt en base64>$<hash en base64>
 *
 * Ocupa unos 86 caracteres, así que la columna `clave` debe ser al menos
 * varchar(255) — de origen era varchar(12) y no cabía.
 */
const PREFIJO = "scrypt"
const N = 16384 // coste de CPU/memoria: 128 · N · r = 16 MB por verificación
const R = 8
const P = 1
const LARGO_CLAVE = 32
const LARGO_SAL = 16

/**
 * Hash señuelo: mismos parámetros de coste que uno real, pero con sal y hash
 * de ceros, así que ninguna contraseña puede coincidir con él.
 *
 * Lo usa el login cuando el usuario no existe. Sin esto, un nombre inexistente
 * se rechazaba al instante y uno real tardaba unos 55 ms en derivar el hash;
 * esa diferencia se mide sin problema por red y revela qué nombres están
 * registrados.
 */
export const HASH_SENUELO = [
  PREFIJO,
  N,
  R,
  P,
  Buffer.alloc(LARGO_SAL).toString("base64"),
  Buffer.alloc(LARGO_CLAVE).toString("base64"),
].join("$")

/** ¿El valor guardado ya es un hash, o es una contraseña heredada en texto plano? */
export function esHash(almacenada: string): boolean {
  return almacenada.startsWith(`${PREFIJO}$`)
}

export async function hashClave(clave: string): Promise<string> {
  const sal = randomBytes(LARGO_SAL)
  // `normalize` evita que la misma contraseña escrita con distinta
  // representación Unicode (acentos, por ejemplo) genere hashes distintos.
  const derivada = await scryptAsync(clave.normalize("NFKC"), sal, LARGO_CLAVE, { N, r: R, p: P })

  return [PREFIJO, N, R, P, sal.toString("base64"), derivada.toString("base64")].join("$")
}

/** Compara en tiempo constante, pasando antes por un digest para igualar largos. */
function comparacionConstante(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest()
  const hb = createHash("sha256").update(b).digest()
  return timingSafeEqual(ha, hb)
}

/**
 * Deriva un hash que se va a descartar, solo para gastar el mismo tiempo que
 * costaría una verificación real. Todos los caminos que terminan en "no" pasan
 * por aquí, de modo que fallar tarde siempre lo mismo.
 */
async function pagarCosteEquivalente(clave: string): Promise<void> {
  await scryptAsync(clave, Buffer.alloc(LARGO_SAL), LARGO_CLAVE, { N, r: R, p: P })
}

/**
 * Verifica una contraseña contra lo guardado.
 *
 * Acepta los dos formatos a propósito: mientras queden contraseñas heredadas
 * en texto plano, nadie debe quedarse fuera. El login se encarga de sustituir
 * el texto plano por su hash en cuanto la persona entra (ver la ruta de login).
 *
 * Tarda prácticamente lo mismo en todos los casos —contraseña correcta,
 * incorrecta, cuenta sin migrar o valor corrupto— para no filtrar por el
 * reloj ni qué cuentas existen ni cuáles siguen sin migrar.
 */
export async function verificarClave(clave: string, almacenada: string): Promise<boolean> {
  const normalizada = clave.normalize("NFKC")

  if (!esHash(almacenada)) {
    // Texto plano heredado (o valor vacío): la comparación en sí es inmediata,
    // así que antes se paga el coste que habría tenido un hash real.
    await pagarCosteEquivalente(normalizada)
    return almacenada.length > 0 && comparacionConstante(almacenada, clave)
  }

  const partes = almacenada.split("$")
  const [, nTexto, rTexto, pTexto, salB64, hashB64] = partes
  const n = Number(nTexto)
  const r = Number(rTexto)
  const p = Number(pTexto)

  if (partes.length !== 6 || !Number.isFinite(n) || !Number.isFinite(r) || !Number.isFinite(p)) {
    await pagarCosteEquivalente(normalizada)
    return false
  }

  try {
    const esperado = Buffer.from(hashB64, "base64")
    const derivada = await scryptAsync(normalizada, Buffer.from(salB64, "base64"), esperado.length, {
      N: n,
      r,
      p,
    })

    return derivada.length === esperado.length && timingSafeEqual(derivada, esperado)
  } catch {
    return false
  }
}
