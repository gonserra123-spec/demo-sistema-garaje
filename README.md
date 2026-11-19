# Tridom Garage (nombre provisional)

Seguimiento de vehículos para talleres mecánicos, con una escena 3D del taller. Producto de Tridom (Valencia).

- **`/`** — landing comercial con la escena en modo simulación y **dos demos separadas**: «Demo 1 · Para tu equipo» (panel del taller) y «Demo 2 · Para tus clientes» (consulta por matrícula).
- **`/panel`** — panel del taller (iPad, móvil y ordenador). PWA instalable.
- **`/consulta/:codigoTaller`** — consulta del cliente por matrícula.

Demo pública: <https://demo-sistema-garaje.suligonserv.workers.dev> (Cloudflare Workers).
- **`/privacidad`** — política de privacidad (borrador con datos marcados como FALTA).

Todo lo que se ve en la demo son **datos ficticios** («Taller Demo», matrículas y teléfonos inventados).

## Arranque en modo demo

Requiere Node 20 o superior.

```bash
npm install
```

```bash
npm run dev
```

Abre `http://localhost:5200`. La landing incluye un tablero «en directo» con el móvil del cliente sincronizado y una calculadora de llamadas; `http://localhost:5200/tv` es la pantalla para la sala de espera (todo con datos ficticios). Panel: código `DEMO01`, PIN `2468`. Consulta: `http://localhost:5200/consulta/DEMO01` con, por ejemplo, la matrícula `1234 BCD` (el coste se ve con las cifras `0101`).

En modo demo **todo funciona dentro del navegador** (MockAdapter): los fixtures se guardan en `localStorage`, las pestañas se sincronizan con `BroadcastChannel` y no se llama a ninguna API. Se regeneran solos a las 12 horas. Por eso la demo funciona igual en un hosting estático.

Para probar el build con las cabeceras de producción (CSP, HSTS) y el service worker:

```bash
npm run build
```

```bash
npm run preview
```

Servidor propio (sirve `dist/` y la API, sin Vite):

```bash
npm start
```

Otros comandos: `npm test` (pruebas de `shared/`, del servidor, del modo demo y del Worker), `npm run audit` (dependencias).

## Despliegue en Cloudflare Workers

`wrangler.jsonc` sirve `dist/` como assets en modo SPA (`not_found_handling: "single-page-application"`): `/panel`, `/consulta/*` y cualquier recarga directa reciben la app. `/api/*` pasa antes por el Worker (`worker/index.js`), que solo atiende `POST /api/contact` y `POST /api/notify`; el resto de `/api/*` responde 404 en JSON. Las cabeceras de la app salen de `public/_headers`.

```bash
npm run build
```

```bash
npx wrangler deploy
```

El Worker **no está conectado a GitHub**: un push no despliega. Hay que ejecutar `wrangler deploy` con sesión (`npx wrangler login`). En el equipo de desarrollo actual hace falta `NODE_OPTIONS=--use-system-ca`, porque un antivirus o proxy inspecciona HTTPS. Para probar en local igual que en producción: `npx wrangler dev` (puerto 8787).

| Secreto (`npx wrangler secret put NOMBRE`) | Para qué |
|---|---|
| `RESEND_API_KEY` | Clave de Resend para el formulario y los avisos |
| `NOTIFY_TOKEN_SECRET` | 32 caracteres o más. Firma los tokens de `/api/notify` (el mismo valor en el backend del panel) |

| Variable (`wrangler.jsonc` → `vars`) | Para qué |
|---|---|
| `CONTACT_TO_EMAIL` | Buzón de Tridom que recibe el formulario. **FALTA** (placeholder) |
| `CONTACT_FROM_EMAIL` | Remitente del formulario, en un dominio verificado en Resend. **FALTA** |
| `WORKSHOP_EMAIL_CONFIG` | JSON por código de taller: `{"DEMO01":{"name":"…","from":"Taller <avisos@dominio>","replyTo":"…","consultaUrl":"https://…/consulta/DEMO01"}}` |
| `ALLOWED_ORIGINS` | Orígenes extra admitidos (separados por comas). Vacío = solo el propio |

Límites con el binding de Rate Limiting de Cloudflare: `CONTACT_LIMITER` (3 por minuto e IP) y `NOTIFY_LIMITER` (20 por minuto y taller).

## Correos al cliente

- Dos avisos transaccionales, nunca marketing: «Tu coche ya está en el taller» (alta con correo y la casilla «Acepto recibir avisos sobre mi coche») y «Tu coche está listo, puedes pasar a recogerlo» (al pasar a «Listo para recoger»). Plantillas en `shared/emails.js`.
- Solo el nombre del taller y la matrícula. La matrícula nunca va en un enlace: el correo dice «entra en la consulta del taller e introduce tu matrícula» y enlaza a `https://…/consulta/CODIGO` sin parámetros (la plantilla rechaza otra cosa).
- `EmailAdapter` (`src/data/emailAdapter.js`): **MockEmailAdapter** en la demo (no envía; Panel → «Correos» enseña el correo exacto) y **ResendEmailAdapter**, que pide el envío al Worker (`/api/notify`).
- `/api/notify` exige un token de un solo mensaje: HMAC-SHA256 con `NOTIFY_TOKEN_SECRET` sobre `{ w: código del taller, m: sha256("kind|to|plate"), exp }`. Lo debe emitir el backend del panel (Edge Function `panel`) después de comprobar en su base de datos el coche, el correo y el consentimiento. Con un token no se puede cambiar el destinatario ni la matrícula, y reenviarlo no duplica el correo (`Idempotency-Key` en Resend). **Pendiente**: emitir ese token en la Edge Function.
- Retención: el correo del cliente se borra con el coche según la retención del taller (30 días tras la entrega por defecto); en la demo, la bandeja de vista previa también. Resend conserva sus registros de envío según su propia política: revisar el plazo en su panel.

### SPF, DKIM y DMARC del dominio remitente

Antes de enviar correos reales, en el DNS del dominio remitente (por ejemplo `avisos.tudominio.es`):

1. Añadir el dominio en Resend (Domains → Add) y copiar los registros que genera.
2. **SPF**: el registro TXT (y MX) que indica Resend para el subdominio de envío. Un solo registro SPF por nombre.
3. **DKIM**: el registro TXT `resend._domainkey` con la clave pública que da Resend.
4. **DMARC**: TXT en `_dmarc`, empezando por `v=DMARC1; p=none; rua=mailto:dmarc@tudominio.es` y subiendo a `quarantine` cuando los informes salgan limpios.
5. Esperar a que Resend marque el dominio como verificado y usar ese remitente en `CONTACT_FROM_EMAIL` y en `WORKSHOP_EMAIL_CONFIG`.

## «Su base de datos»

El `DataAdapter` (`src/data/adapter.js`) es el punto de enchufe para conectar más adelante la base de datos del taller: hoy hay MockAdapter (demo en el navegador), ApiAdapter (`server/`, `VITE_DATA_ADAPTER=api`) y SupabaseAdapter (`VITE_DATA_ADAPTER=supabase`). No hay nada más construido.

## Estructura

| Ruta | Qué hay |
|---|---|
| `shared/` | Reglas comunes a cliente y servidor: estados y plazas (`domain.js`), matrículas (`plates.js`), validación (`validate.js`), catálogo (`models.json`) y plantilla del taller (`template.json`) |
| `server/` | API de demo sin dependencias: PIN con hash, sesión en cookie httpOnly, consulta pública, tiempo real (SSE), retención |
| `src/data/` | `DataAdapter` con dos implementaciones (`mockAdapter.js`, `supabaseAdapter.js`) y el estado del panel con cola offline (`panelStore.js`) |
| `src/scene/` | Escena 3D: rutas (`paths.js`), coches paramétricos (`carProfile.js`, `carGeometry.js`), nave (`world.js`), mecánico, motor (`engine.js`), cámara, simulación |
| `src/pages/` | Landing, panel, consulta y privacidad |
| `supabase/` | Migración SQL con RLS y Edge Functions `panel` y `consulta` |
| `docs/` | Despliegue en Supabase, licencias de assets y registro del proyecto |

## Capa de datos

Toda la app habla con la interfaz `DataAdapter` (`src/data/adapter.js`).

- **MockAdapter** (por defecto): todo en el navegador, sin red (`src/data/mockAdapter.js`). Fixtures ficticios en `localStorage` y tiempo real entre pestañas con `BroadcastChannel`. Si una llamada no responde en 8 s, la pantalla muestra un error con «Reintentar».
- **ApiAdapter** (`VITE_DATA_ADAPTER=api`): la API propia de `server/` (`npm start`), con SSE. Rechaza cualquier respuesta que no sea JSON: antes, la página HTML de un hosting estático se tomaba por una sesión y el panel quedaba en blanco. La cola de cambios sin conexión y la última copia del panel se guardan en `localStorage` del dispositivo del taller y se borran al salir.
- **SupabaseAdapter**: se activa con `VITE_DATA_ADAPTER=supabase`. Ver [docs/deploy-supabase.md](docs/deploy-supabase.md). Está escrito y documentado pero **no se ha probado contra un proyecto real** (no hay credenciales).

La consulta del cliente pasa siempre por servidor (API de demo o Edge Function). El navegador nunca recibe más que el DTO de ese coche y, de los demás, la plaza que ocupan.

## Escena 3D

- Plantilla del taller en `shared/template.json` (n.º de elevadores, foso sí/no, posiciones). El color de marca y el nombre del taller se pintan en la nave.
- Los coches se generan por código: un perfil lateral por arquetipo (10) escalado al largo, ancho y alto del modelo. Es un parecido por categoría con proporciones reales, **no una réplica** de cada modelo. Para añadir un GLB exacto más adelante basta con que `carParts()` (`src/scene/carGeometry.js`) devuelva su geometría para ese `modelId`.
- Cada coche tiene un único objetivo vigente (la plaza y el estado que dicen los datos). Al terminar el tramo en curso se replanifica, así que las órdenes intermedias se comprimen y no hay saltos.
- Al cargar, la escena se coloca ya en su estado actual; solo se animan los cambios posteriores.
- Si WebGL no está disponible o los fotogramas caen de forma sostenida, se pasa a una vista en lista con los mismos estados. `?gl=1` en la URL desactiva esa caída (para medir).
- Ritmo: un único parámetro `SIM_SPEED` (`src/scene/speed.js`, ahora 1,6). Coches ×1,6 (velocidad y aceleración), llegadas y esperas de la simulación ×0,65, mecánico y elevadores ×1,25. No toca el mapeo del scroll de la cámara. Prueba de continuidad: `scripts/c1-continuity.browser.js`.
- Un elevador que se queda arriba sin coche (porque el coche se borró o salió de los datos) baja solo.

### Gancho de depuración

En cualquier página con escena, `window.__garage` expone:

- `frame()` — posición y orientación de cada coche, mecánico y elevador en ese fotograma.
- `engine.startRecording()` / `engine.stopRecording()` — salto máximo por fotograma de coches, mecánico y elevadores, giro máximo, distancia mínima entre coches y estados imposibles.
- `engine.advance(segundos)` — avanza la simulación a pasos fijos de 1/60 s sin esperar al reloj (los navegadores automatizados frenan el `requestAnimationFrame`).
- `stats()` — fps y tiempo de fotograma medidos, triángulos y llamadas de dibujo.
- `sim` — en la landing, el almacén de la simulación (`sim.setState(id, estado)`).

## Rendimiento y móvil

- Caché: `/assets/*` (con hash) `max-age=31536000, immutable`; HTML con revalidación; `sw.js` sin caché (`public/_headers`).
- Escena 3D: se pausa fuera de pantalla y con la pestaña oculta; DPR 1 en móvil y ≤ 1,5 en escritorio; si baja de 45 fps durante 2 s, el DPR pasa a 1.
- Mapa: chunk diferido; en móvil DPR ≤ 1,5, caché de 40 tiles y edificios 3D desde el zoom 15; se destruye al alejarse de la sección.
- Móvil o táctil: sin mosaico animado ni parallax; secciones fijadas con `100svh`; safe-area en barras fijas.

## Estructura por superficies

`src/surfaces/index.js` registra una entrada (chunk) por superficie para poder separarlas después en tres productos: **oficina** (panel simple; hoy `/panel` como «Oficina», con `src/surfaces/office/`), **taller** (tablero, escena y «Siguiente paso»; hoy `/panel` como mecánico, con `src/surfaces/workshop/`) y **cliente** (consulta, cita y sala de espera). Comparten `src/components`, `src/data` (DataAdapter y EmailAdapter) y `shared/`. Las pantallas separadas todavía no existen.

## Seguridad

- Validación en cliente y en servidor con el mismo código (`shared/validate.js`).
- Cabeceras: CSP, `X-Frame-Options`, `X-Content-Type-Options`, HSTS, `Referrer-Policy`, `Permissions-Policy` (`server/security.js` y `public/_headers`; mantener ambas iguales).
- PIN con scrypt, 5 fallos por IP cada 5 min y 20 por taller cada 15 min; sesión en cookie `HttpOnly; SameSite=Strict` (`Secure` bajo HTTPS).
- Peticiones que cambian algo: mismo origen y cabecera propia `X-Requested-With`.
- Consulta pública: honeypot, límite por IP y por matrícula, respuesta idéntica y con el mismo suelo de tiempo para «no existe» y «dato incorrecto»; el coste exige las 4 últimas cifras del teléfono (5 intentos cada 15 min y 15 al día por coche).
- Ninguna clave en el frontend; los secretos van por variables de entorno (`.env.example`) o por secretos de Wrangler.
- Worker: `/api/*` solo con POST, mismo origen y cabecera propia, JSON de 16 KB como máximo (4 KB en notify), validación con `shared/validate.js`, honeypot, límite por IP (contacto) y por taller (avisos), y cabeceras propias con `default-src 'none'`.
- CSP: `connect-src` e `img-src` admiten `https://tiles.openfreemap.org`; `worker-src 'self' blob:` y `child-src blob:` para el worker de MapLibre.

Pendiente de infraestructura (fuera del código, a cargo de Tridom): Cloudflare con WAF, SSL «Full (strict)», «Always Use HTTPS» y 2FA en Cloudflare, GitHub y Supabase.

## Datos que faltan (FALTA)

Dominio definitivo (canonical y `og:url`), precios, contacto y redes de Tridom, logo, datos del responsable y del encargado en la política de privacidad, y proveedor de alojamiento. Para activar los correos: clave de Resend, dominio remitente verificado (SPF/DKIM/DMARC) y `CONTACT_TO_EMAIL`.

## Modo demo y entrega a un taller real

- `DEMO_MODE=1` (por defecto): «Taller Demo» con datos ficticios, PIN visible en el acceso y etiqueta DEMO en el panel.
- `DEMO_MODE=0`: sin demo. No existe «Taller Demo», no hay datos ficticios y no hay ningún PIN conocido. El servidor crea un único taller vacío con estas variables:

| Variable | Qué es |
|---|---|
| `WORKSHOP_CODE` | Código del taller (4 a 12 letras o cifras) |
| `WORKSHOP_PIN` | PIN del taller (4 a 8 cifras) |
| `WORKSHOP_NAME` | Nombre que se pinta en la nave |
| `WORKSHOP_LIFTS`, `WORKSHOP_PIT` | Elevadores (por defecto 2) y foso (`0` para quitarlo) |
| `WORKSHOP_COLOR` | Color de marca, por ejemplo `#2F6FED` |

Si falta el código o el PIN, el servidor avisa por consola y no crea ningún taller. Los datos del servidor de `server/` viven en memoria: para un taller real usa el adaptador de Supabase (`docs/deploy-supabase.md`).

## Novedades del panel

- **Recordar quién eres:** el dispositivo guarda el código del taller y el operador (Oficina, Mecánico 1 o 2). Solo se pregunta la primera vez; queda un enlace «Cambiar».
- **Historial:** los coches entregados salen de la lista y se consultan en Ajustes, con buscador por matrícula, mientras dure la retención.
- **Pista de una sola vez:** «Toca un coche…» se enseña una vez por dispositivo.
- **Entrega estimada:** bloque propio en la ficha, con Hoy, Mañana, +2 días y +1 semana. Si el coche está en reparación o esperando y no tiene fecha, el panel la pide. En la lista, «Retrasado» marca las fechas pasadas. El cliente ve la fecha o «el taller aún no ha indicado una fecha».
- **Etiquetas rápidas:** un toque en lugar de escribir (3 a 40 letras, hasta 8 por coche). Las del taller se editan en Ajustes (hasta 12) y se pueden restaurar.
- **Resumen del día (Oficina):** entradas de hoy, entregados de hoy y coches con más de N días (5 por defecto, editable). Cada número filtra la lista.
- **Albarán con QR:** en la ficha del coche, «Imprimir albarán». Cada coche tiene un código corto de 6 caracteres (sin I, O, 0 ni 1) y el QR abre `/consulta/<CÓDIGO_TALLER>?c=<CÓDIGO_COCHE>` directamente. El código no se puede adivinar (unos mil millones de combinaciones, con límite de intentos por IP), la respuesta es la misma si no existe y el coste sigue pidiendo las 4 últimas cifras del teléfono.
- **Landing:** la cabecera tiene tres enlaces (Cómo funciona, Probar demo, Contacto); el resto está en el pie.

Con Supabase: aplicar `supabase/migrations/0002_panel_mejoras.sql` y volver a desplegar las funciones `panel` y `consulta`. Está escrito pero no se ha probado contra un proyecto real.

## Citas y clientes habituales

- **Cita del cliente** (`/cita/CODIGO`, en la demo `/cita/DEMO01`): matrícula, correo, día, franja y motivo. Si la matrícula ya es de un cliente del taller, se reconoce y no se pide el coche. La reserva no pisa los datos de contacto que el taller ya tenía.
- **Panel → Citas**: aparecen arriba; «Ha llegado» da de alta el coche con un toque.
- **Panel → Clientes**: importa un CSV exportado de su programa de gestión (`;`, `,` o tabulador; columnas matrícula, marca, modelo o vehículo, teléfono y correo). Hay plantilla descargable, vista previa y rechazo fila a fila.
- **Pendiente**: envío real de correos de confirmación y las acciones equivalentes en las Edge Functions de Supabase (`customers_summary`, `customers_import`, `appt_list`, `appt_arrive`, `appt_cancel`, `customer_check`, `book`), con sus tablas y RLS. Antes de importar datos reales hace falta el contrato de encargado del tratamiento con cada taller.
