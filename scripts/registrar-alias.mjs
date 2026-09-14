// Registra el resolutor de alias para poder importar rutas de Next desde Node.
// Se usa con --import, antes de que se cargue el script de la auditoria.
import { register } from "node:module"
import { pathToFileURL } from "node:url"

register("./resolver-alias.mjs", pathToFileURL("./scripts/"))
