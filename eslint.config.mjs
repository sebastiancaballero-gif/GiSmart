import nextConfig from "eslint-config-next"

const config = [
  ...nextConfig,
  {
    ignores: [".next/**", "node_modules/**", "components/ui/**"],
  },
]

export default config
