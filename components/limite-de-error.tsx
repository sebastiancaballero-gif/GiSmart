"use client"

import { Component, type ReactNode } from "react"

/**
 * Contiene un fallo de render para que no se lleve la pantalla entera.
 *
 * Existe por la conectividad de las mufas: el JSON lo genera una función de la
 * base y lo dibuja el esquemático, dos piezas que se escriben por separado. Si
 * el JSON llega con una forma que el esquemático no espera, el error de render
 * subiría hasta la página y el usuario perdería el mapa entero. Con esto solo
 * se pierde el diagrama.
 *
 * No dibuja nada propio cuando falla: avisa con `alFallar` y quien lo usa
 * decide cómo contarlo. Así el aviso va a la misma pila que los demás en vez
 * de montarse encima de ellos.
 *
 * Tras un fallo se queda vacío hasta que se remonta. Para volver a intentarlo,
 * quien lo usa le cambia la `key`.
 *
 * React solo permite capturar errores de render con un componente de clase.
 */
export class LimiteDeError extends Component<
  { children: ReactNode; alFallar?: (error: Error) => void },
  { fallo: boolean }
> {
  state = { fallo: false }

  static getDerivedStateFromError() {
    return { fallo: true }
  }

  componentDidCatch(error: Error) {
    console.error("[limite de error]", error)
    this.props.alFallar?.(error)
  }

  render() {
    return this.state.fallo ? null : this.props.children
  }
}
