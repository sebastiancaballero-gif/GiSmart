# Despliegue en servidor Windows

Guía para publicar GISmart en el servidor Windows de la empresa, sin Docker: Node.js
corriendo como servicio del sistema e IIS haciendo de reverse proxy con HTTPS.

Se eligió este camino en vez de Docker porque en Windows Server implica licencia de
Docker Desktop para uso comercial o contenedores Linux vía WSL2, complejidad que no se
justifica para una sola aplicación.

```
Internet → IIS (443, dominio + certificado) → localhost:3000 (Node/Next.js, servicio NSSM)
```

---

## 1. Preparar el servidor

Instalar en el servidor:

- **Node.js 22 LTS** (instalador MSI de nodejs.org). Verificar con `node -v`.
- **pnpm**: `npm install -g pnpm`
- **Git** (opcional, para actualizar con `git pull` en vez de copiar archivos).
- **NSSM** (https://nssm.cc) — descomprimir en, por ejemplo, `C:\tools\nssm`.

---

## 2. Colocar el proyecto y construirlo

```powershell
cd C:\apps
git clone https://github.com/sebastiancaballero-gif/GISmart.git
cd GISmart
pnpm install
```

Crear `C:\apps\GISmart\.env.local` con las variables reales:

```
AUTH_JWT_SECRET=<secreto aleatorio propio del servidor>
SUPABASE_URL=https://<proyecto>.supabase.co
SUPABASE_SECRET_KEY=sb_secret_<...>
```

> Este archivo **no** viene del repositorio (está en `.gitignore`) y no debe subirse nunca.
> Generar un `AUTH_JWT_SECRET` distinto al de desarrollo.

Construir:

```powershell
pnpm run build
```

---

## 3. Registrar el servicio con NSSM

```powershell
C:\tools\nssm\nssm.exe install GISmart
```

En la ventana que abre:

| Campo | Valor |
| --- | --- |
| Path | `C:\Program Files\nodejs\node.exe` |
| Startup directory | `C:\apps\GISmart` |
| Arguments | `node_modules\next\dist\bin\next start -p 3000` |

En la pestaña **I/O** conviene apuntar stdout y stderr a archivos, por ejemplo
`C:\apps\GISmart\logs\out.log` y `C:\apps\GISmart\logs\err.log`, para poder diagnosticar.

Arrancar y comprobar:

```powershell
nssm start GISmart
curl http://localhost:3000
```

El servicio queda visible en `services.msc`, arranca solo con el servidor y se reinicia
si el proceso se cae.

---

## 4. IIS como reverse proxy

1. Instalar el rol **IIS** si no está.
2. Instalar los módulos **URL Rewrite** y **Application Request Routing (ARR)**
   (descarga de Microsoft).
3. En el nodo raíz del servidor → **Application Request Routing Cache** → *Server Proxy
   Settings* → marcar **Enable proxy**.
4. Crear un sitio nuevo con el binding del dominio interno o público.
5. En ese sitio → **URL Rewrite** → *Add Rule* → *Reverse Proxy* → destino
   `localhost:3000`.

### HTTPS

- Con certificado propio de la empresa: importarlo en **Server Certificates** y asociarlo
  al binding 443 del sitio.
- Con Let's Encrypt: usar **win-acme** (`wacs.exe`), que renueva automáticamente y
  configura el binding de IIS.

Conviene agregar una regla de IIS que redirija HTTP (80) a HTTPS (443).

---

## 5. Actualizar a una versión nueva

```powershell
cd C:\apps\GISmart
nssm stop GISmart
git pull
pnpm install
pnpm run build
nssm start GISmart
```

Hay unos segundos de corte durante el `stop`/`start`. Si más adelante se necesita
despliegue sin corte, la alternativa es levantar una segunda instancia en otro puerto y
mover el proxy de IIS al nuevo puerto antes de apagar la anterior.

---

## Verificación posterior

- [ ] `http://localhost:3000` responde en el propio servidor.
- [ ] El dominio responde por HTTPS desde otro equipo.
- [ ] El login funciona (valida contra Supabase, o sea que hay salida a internet).
- [ ] El mapa carga las mufas y los cables (endpoints `/api/mufas` y `/api/fiber-cables`).
- [ ] Reiniciar el servidor y confirmar que el servicio levanta solo.

---

## Notas

- El servidor necesita **salida a internet** hacia `*.supabase.co`; si hay firewall de
  salida, hay que habilitarlo.
- El puerto 3000 **no** debe quedar expuesto al exterior: solo IIS debe alcanzarlo.
- Los logs de Node quedan donde se hayan configurado en NSSM; los de IIS, en
  `C:\inetpub\logs\LogFiles`.
