import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { TooltipProvider } from '@/components/ui/tooltip'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })

export const metadata: Metadata = {
  title: 'GiSmart — SIG de red de fibra',
  description: 'Sistema de Información Geográfica · GiSmart Redes de Telecomunicaciones',
  icons: {
    icon: [{ url: '/icon.svg', type: 'image/svg+xml' }],
  },
}

export const viewport: Viewport = {
  colorScheme: 'light dark',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: 'white' },
    { media: '(prefers-color-scheme: dark)', color: 'black' },
  ],
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="es" className={`${inter.variable} bg-background`} suppressHydrationWarning>
      <head>
        {/* Aplica el tema guardado antes del primer pintado, para evitar un parpadeo. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{var t=localStorage.getItem('gismart_theme');if(t==='dark'){document.documentElement.classList.add('dark')}else if(t==='light'){document.documentElement.classList.add('light')}}catch(e){}",
          }}
        />
      </head>
      <body className="font-sans antialiased">
        {/* El proveedor comparte el retardo entre todas las etiquetas: abierta
            una, las de al lado salen al instante. Es lo que hace cómodo
            recorrer la barra de ocho herramientas del mapa. */}
        <TooltipProvider>{children}</TooltipProvider>
      </body>
    </html>
  )
}