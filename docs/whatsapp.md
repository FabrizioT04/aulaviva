# Reportes por WhatsApp

Los docentes siguen escribiendo al WhatsApp Business de la sede como siempre. Hazio lee cada mensaje, arma el reporte y lo pone en el dashboard como **Pendiente**, con origen "WhatsApp (automático)". TI recibe el push igual que con el QR.

## Cómo conversa Hazio

| El docente escribe | Hazio responde |
|---|---|
| "El proyector del 204 no prende" | Registrado ✅ Proyector en Aula 204 (3B). TI ya lo tiene en el panel. |
| "No hay internet" (sin aula) | ¿Es en Aula 204 (3B)? **[Sí] [Otra aula]** (la última aula que reportó ese número) |
| "No hay internet" (primera vez, sin aula) | ¿En qué aula es? Escríbeme el número o la sección, por ejemplo 204 o 4A. |
| "En el 4A algo falla" (sin falla) | Lista **Elegir falla** con las fallas de esa aula |
| Una foto y luego el texto | La foto se agrega al reporte (hasta 3) |
| "Buenos días", "Gracias", cualquier otra cosa | Nada. Lo sigue leyendo TI en la app, como siempre. |

- Entiende el aula por número (204, aula 204), por sección (4A, 4to A, 4° A, 10B, PKA) o por nombre (Welcome Lobby, sala de docentes, patio). Si nombra dos aulas, pregunta.
- La falla se reconoce con las mismas reglas que sugieren el tipo en Registrar (internet, wifi, proyector, laptop, parlante, impresora, ecran…). "Urgente" o "no puedo continuar la clase" lo marca como que bloquea la clase.
- Si la falla ya estaba abierta en esa aula, no la duplica: responde "Ya estaba registrado ✅" y también le avisará cuando se resuelva.
- Si no entiende la respuesta, pregunta una vez más. Si tampoco, o si el docente no responde en 30 minutos, se calla y el mensaje queda en **Por clasificar**.

**Por clasificar** aparece arriba del dashboard solo cuando hay mensajes pendientes. TI elige el aula y la falla y toca **Registrar reporte** (si el docente escribió en las últimas 24 h, le llega "Registrado ✅"), o **Descartar** si no era un reporte.

**Resuelto ✅**: al resolver un reporte que llegó por WhatsApp, Hazio le escribe al docente solo si no pasaron 24 h desde su último mensaje. Si pasaron, no escribe; se lo cuenta ("Por cierto, ya quedó resuelto ✅…") la próxima vez que el docente escriba.

## Cuánto cuesta

Nada, mientras se use así. WhatsApp cobra solo los mensajes de **plantilla** (los que una empresa envía fuera de la ventana de 24 h). Todo lo que responde Hazio va dentro de las 24 h desde el último mensaje del docente, y eso es gratis. Hazio nunca envía plantillas. Meta puede pedir una tarjeta en la cuenta de WhatsApp Business; si solo se responde dentro de las 24 h, no se cobra nada.

## Antes de empezar

- La cuenta de **Meta Business** (business.facebook.com) de la empresa, con permiso de administrador.
- El celular con el **WhatsApp Business** de la empresa, actualizado.
- Tu PC con el repositorio, `npm install` hecho y `npx wrangler login` con la cuenta de Cloudflare de trabajo.

Los nombres de los menús de Meta cambian seguido. Si algo no coincide, busca la opción equivalente.

## Paso 1. Crea la app en Meta

1. Entra a [developers.facebook.com](https://developers.facebook.com) con tu cuenta de Facebook y toca **Mis apps → Crear app**.
2. Caso de uso: **Otro** y luego tipo **Empresa** (Business). Nombre: `Hazio`. Elige la cuenta comercial de la empresa.
3. En el panel de la app, agrega el producto **WhatsApp** (**Configurar**).
4. En **Configuración de la app → Básica** copia la **Clave secreta de la app** (botón Mostrar). Es `WA_APP_SECRET`.

## Paso 2. Prueba primero con el número de prueba de Meta (recomendado)

Así se prueba todo sin tocar el número de la empresa.

1. En **WhatsApp → Configuración de la API** (API Setup), Meta te da un **número de prueba** gratis y un **token temporal** (dura 24 h).
2. Copia el **Identificador del número de teléfono** (Phone number ID). Es `WA_PHONE_ID`.
3. En **Para** agrega tu celular y confírmalo con el código que te llega. El número de prueba solo puede escribir a números confirmados (hasta 5).
4. Sigue los pasos 4 a 6 con estos datos. Cuando funcione, haz el paso 3 para pasar al número real.

## Paso 3. Conecta el número de la empresa (coexistencia)

En **coexistencia** el número sigue funcionando en la app de WhatsApp Business del celular y, a la vez, Hazio recibe los mensajes. Los chats y contactos siguen en la app.

1. En el panel de la app de Meta, en WhatsApp, busca **Agregar número de teléfono** o **Registro insertado** (Embedded Signup) y elige la opción para **conectar una cuenta existente de la app WhatsApp Business**.
2. Ingresa el número de la empresa. Meta te mostrará un **código QR**.
3. En el celular: WhatsApp Business → **Configuración → Herramientas para la empresa** (o el aviso que aparece) → escanea el QR. Acepta compartir el historial si te lo pregunta.
4. Al terminar, en **WhatsApp → Configuración de la API** elige el número de la empresa y copia su **Identificador del número de teléfono**: reemplaza a `WA_PHONE_ID`.

Lo que conviene saber de la coexistencia (según Meta; puede cambiar):

- Pide la app WhatsApp Business actualizada y que el número tenga un tiempo de uso en la app (Meta habla de al menos 7 días).
- Algunas funciones de la app se limitan con el número conectado, por ejemplo los mensajes temporales y los de una sola visualización. Los grupos siguen en la app, pero Hazio no los lee: solo ve los chats individuales.
- Si en tu cuenta no aparece la opción de conectar un número existente, Meta puede estar pidiendo la verificación de la empresa. En ese caso escríbeme y vemos otro camino; mientras tanto, el número de prueba sirve para seguir probando.

## Paso 4. Token permanente

El token temporal vence en 24 h. Para uno que no venza:

1. [business.facebook.com](https://business.facebook.com) → **Configuración del negocio → Usuarios → Usuarios del sistema → Agregar**. Nombre `hazio`, rol **Administrador**.
2. **Asignar activos**: la app Hazio (control total) y la cuenta de WhatsApp (control total).
3. **Generar token**: elige la app Hazio, caducidad **Nunca**, y marca los permisos `whatsapp_business_messaging` y `whatsapp_business_management`. Cópialo: es `WA_TOKEN`. No lo pegues en ningún chat ni en el repositorio.

## Paso 5. Publica Hazio con lo nuevo

En tu PC, en la carpeta del repositorio, con la rama ya fusionada en `main`:

```bash
git checkout main
git pull
npm install

# 1. Primero la base de datos (crea las tablas de WhatsApp)
npx wrangler d1 migrations apply incidencias --remote

# 2. Los secretos. Cada comando te pide el valor; pégalo y Enter
npx wrangler secret put WA_VERIFY_TOKEN     # invéntalo tú: una frase larga sin espacios, ej. hazio-wsp-2026-xyz
npx wrangler secret put WA_APP_SECRET       # Clave secreta de la app (paso 1)
npx wrangler secret put WA_TOKEN            # token permanente (paso 4) o el temporal para probar
npx wrangler secret put WA_PHONE_ID         # Identificador del número de teléfono
npx wrangler secret put WA_NUMEROS_PRUEBA   # mientras pruebas: tu número con 51 adelante, sin + ni espacios (ej. 51987654321). Varios, separados por coma

# 3. Publicar
npm run deploy
```

Con `WA_NUMEROS_PRUEBA`, Hazio solo atiende esos números y a los demás no les responde nada, aunque el número de la empresa ya esté conectado. Cuando quieras abrirlo a todos los docentes:

```bash
npx wrangler secret delete WA_NUMEROS_PRUEBA
```

## Paso 6. Deja pasar a Meta por Cloudflare Access

Access pide iniciar sesión en todo Hazio, y Meta no puede. Hay que abrirle solo la dirección del webhook (cada aviso de Meta viene firmado con la clave secreta de la app, y Hazio rechaza los que no tienen esa firma).

1. Panel de Cloudflare → **Zero Trust → Access → Applications → Add an application → Self-hosted**.
2. Nombre: `Hazio WhatsApp webhook`. **Application domain**: `aulaviva.smp1.workers.dev`, **path**: `api/whatsapp/webhook`.
3. Policy: nombre `Meta`, acción **Bypass**, regla **Include → Everyone**. Guarda.

Comprueba en el navegador (cambia el texto por tu `WA_VERIFY_TOKEN`):

```
https://aulaviva.smp1.workers.dev/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=TU_WA_VERIFY_TOKEN&hub.challenge=hola
```

Debe mostrar solo `hola`. Si te pide iniciar sesión, la regla del paso 6 no se aplicó. Si muestra "No autorizado", el token no coincide.

Usa la dirección `aulaviva.smp1.workers.dev` y no la de Hazio: la entrada `hazio.smp1.workers.dev` exige la sesión de Access en todas sus rutas.

## Paso 7. Conecta el webhook en Meta

1. En la app de Meta: **WhatsApp → Configuración** (Configuration) → **Webhook → Editar**.
2. **URL de devolución de llamada**: `https://aulaviva.smp1.workers.dev/api/whatsapp/webhook`
3. **Token de verificación**: el mismo `WA_VERIFY_TOKEN`. Toca **Verificar y guardar**.
4. En **Campos del webhook**, suscríbete a **messages**.
5. Con el número de la empresa (paso 3), suscribe la app a la cuenta de WhatsApp. En una terminal, con el **Identificador de la cuenta de WhatsApp Business** (WABA ID, sale en Configuración de la API) y el token:

   ```bash
   curl -X POST "https://graph.facebook.com/v23.0/WABA_ID/subscribed_apps" -H "Authorization: Bearer WA_TOKEN"
   ```

   Debe responder `{"success":true}`.

## Paso 8. Prueba

Desde tu celular (el que pusiste en `WA_NUMEROS_PRUEBA`), escríbele al número:

1. "El proyector del 204 no prende" → responde Registrado ✅ y aparece en el dashboard.
2. "No hay internet" → pregunta si es en el 204, toca **Otra aula** y escribe "4A".
3. "Algo falla en el 305" → te muestra la lista de fallas.
4. En el dashboard resuelve el reporte → te llega Resuelto ✅.
5. Escribe "No hay internet" y no respondas → a los 30 minutos queda "Sin respuesta" en **Por clasificar**.

Si no responde nada: `npx wrangler tail` muestra los registros mientras escribes. Los errores de WhatsApp empiezan con `whatsapp:`.

## Secretos

| Secreto | Qué es |
|---|---|
| `WA_VERIFY_TOKEN` | Frase que eliges tú; Meta la envía una vez para verificar el webhook |
| `WA_APP_SECRET` | Clave secreta de la app de Meta; comprueba que cada aviso viene de Meta |
| `WA_TOKEN` | Token del usuario del sistema para responder y bajar las fotos |
| `WA_PHONE_ID` | Identificador del número de teléfono que responde |
| `WA_NUMEROS_PRUEBA` | Opcional. Solo estos números (51987654321,51912345678). Sin él, todos |

Sin `WA_APP_SECRET` el webhook no acepta nada. Sin `WA_TOKEN` o `WA_PHONE_ID` recibe y registra, pero no responde.
