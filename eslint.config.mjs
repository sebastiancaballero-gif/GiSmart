import { dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { FlatCompat } from "@eslint/eslintrc"

// eslint-config-next 15 viene en el formato anterior de ESLint: FlatCompat lo
// traduce a la configuración plana.
const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) })

const config = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    // Las reglas «recomendadas» del plugin de hooks 7 (pnpm-workspace.yaml lo
    // fija para eslint-config-next 15), como las tenía la configuración de Next 16.
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "react-hooks/static-components": "error",
      "react-hooks/use-memo": "error",
      "react-hooks/preserve-manual-memoization": "error",
      "react-hooks/incompatible-library": "warn",
      "react-hooks/immutability": "error",
      "react-hooks/globals": "error",
      "react-hooks/refs": "error",
      "react-hooks/set-state-in-effect": "error",
      "react-hooks/error-boundaries": "error",
      "react-hooks/purity": "error",
      "react-hooks/set-state-in-render": "error",
      "react-hooks/unsupported-syntax": "warn",
      "react-hooks/config": "error",
      "react-hooks/gating": "error",
    },
  },
  {
    // `components/network-schematic.tsx` no lo usa ninguna página y lo mantiene
    // otra persona del equipo (ver «Pendientes conocidos» en el README). Antes
    // se excluía solo en `pnpm verificar` y `pnpm lint` fallaba por él.
    ignores: [".next/**", "node_modules/**", "components/ui/**", "components/network-schematic.tsx", "next-env.d.ts"],
  },
]

export default config
