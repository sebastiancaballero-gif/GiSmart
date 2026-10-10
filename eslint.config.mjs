import nextConfig from "eslint-config-next"

const config = [
  ...nextConfig,
  {
    // `components/network-schematic.tsx` no lo usa ninguna página y lo mantiene
    // otra persona del equipo (ver «Pendientes conocidos» en el README). Antes
    // se excluía solo en `pnpm verificar` y `pnpm lint` fallaba por él.
    ignores: [".next/**", "node_modules/**", "components/ui/**", "components/network-schematic.tsx"],
  },
]

export default config
