# Configurar Cloudflare Access para AulaViva

Cloudflare Access pide iniciar sesión antes de abrir la app. AulaViva lee quién
entró (verificando la firma del token de Access) y decide su rol:

| Rol | Quién | Qué puede usar |
|---|---|---|
| TI | Los correos de `TI_EMAILS` | Todo: registro, dashboard, observatorio, QR |
| COA | Los correos de `COA_EMAILS` | Ve todo el panel sin cambiar nada; en Daños y mantenimiento atiende los del local y solo mira los equipos tecnológicos |
| Docente | Cualquier `@innovaschools.edu.pe` | Solo la página del QR (`/r/<aula>`) |

Cualquier otro correo queda fuera. Los menús del panel de Cloudflare pueden cambiar de nombre con el tiempo; si algo no coincide, busca la opción equivalente.

## 1. Publica la app primero

Sigue "Publicar en Cloudflare" del README. Necesitas la URL `https://aulaviva.<tu-cuenta>.workers.dev`.

## 2. Crea tu equipo de Zero Trust

En el panel de Cloudflare entra a **Zero Trust** y elige un nombre de equipo, por ejemplo `innova-ti`.
Tu dominio de equipo será `https://innova-ti.cloudflareaccess.com`.

> **Ojo con el límite de usuarios:** el plan gratuito de Zero Trust cubre hasta 50 usuarios.
> Cada persona que inicia sesión ocupa un lugar. Con unos 55 docentes más TI podrías pasarte;
> revisa el límite vigente en la página de precios de Cloudflare antes de dar acceso a toda la sede.

## 3. Elige cómo inician sesión

En **Settings → Authentication → Login methods**:

- **One-time PIN** (el más simple): Access envía un código al correo. No requiere configurar nada más.
- **Google**: los docentes entran con su cuenta de Google del colegio. Requiere crear un ID de cliente OAuth en Google Cloud; Cloudflare muestra los pasos al agregarlo.

## 4. Crea la aplicación de Access

**Access → Applications → Add an application → Self-hosted**:

- **Application name:** AulaViva
- **Session duration:** 1 month (así el docente no inicia sesión cada vez que escanea)
- **Application domain:** `aulaviva.<tu-cuenta>.workers.dev`
- **Policy:** nombre `Personal Innova`, acción **Allow**, regla **Include → Emails ending in → `@innovaschools.edu.pe`**

Guarda la aplicación.

## 5. Conecta AulaViva con Access

En la aplicación que creaste, copia el **Application Audience (AUD) Tag**. Luego edita `wrangler.jsonc`:

```jsonc
"vars": {
  "ACCESS_TEAM_DOMAIN": "https://innova-ti.cloudflareaccess.com",
  "ACCESS_AUD": "pega-aqui-el-aud-tag",
  "DOMINIO_DOCENTES": "innovaschools.edu.pe"
}
```

Publica con `npm run deploy`. Después guarda los correos de TI como secreto, para que no queden en el repositorio público:

```bash
npx wrangler secret put TI_EMAILS
# escribe los correos separados por coma, sin espacios:
# tu.correo@innovaschools.edu.pe,otro.correo@innovaschools.edu.pe
```

Para agregar o quitar a alguien de TI, vuelve a correr ese comando con la lista completa.

COA entra al mismo panel y ve todas las pestañas en modo lectura, menos Registrar. Solo cambia cosas en Daños y mantenimiento: registra y cierra los desperfectos del local; los equipos tecnológicos dañados los atiende TI y COA solo los mira. Sus correos van en otro secreto, con el mismo formato:

```bash
npx wrangler secret put COA_EMAILS
```

Si un correo está en `TI_EMAILS`, entra como TI aunque también esté en otra lista.

La clave `TOKEN_TI` nunca funciona en producción (solo en `localhost`): solo entra quien pasa por Access. Si tenías el secreto `TOKEN_TI` guardado en Cloudflare, puedes borrarlo con `npx wrangler secret delete TOKEN_TI`.

## 6. Prueba

1. Abre la URL de la app: Access te pide iniciar sesión y luego ves el panel de TI.
2. Abre `https://aulaviva.<tu-cuenta>.workers.dev/r/204` desde otro celular con un correo de docente: debe ver solo el formulario del aula 204.
3. Si un docente abre el panel de TI, verá un aviso de que no tiene permiso.

## Acceso para el reporte semanal

El correo de los viernes (Apps Script) lee `GET /api/resumen-semanal` con un **service token** de Access, sin usuario ni contraseña:

1. **Access → Service credentials → Service Tokens → Create Service Token**, nombre `reporte-semanal`. Copia el Client ID y el Client Secret.
2. En la aplicación AulaViva agrega una política con acción **Service Auth** e **Include → Service Token → reporte-semanal**.
3. Guarda el Client ID en el Worker: `npx wrangler secret put ACCESS_SERVICE_TOKEN_ID`.

Ese token solo puede leer el resumen semanal; cualquier otra ruta le responde 403.

## Imprimir los QR

En el dashboard, toca **QR de aulas** y luego **Imprimir**. Imprímelos después de publicar, porque cada QR guarda la dirección de la app.
