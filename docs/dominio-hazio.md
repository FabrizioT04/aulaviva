# Dirección de Hazio

`hazio.smp1.workers.dev` es una entrada al Worker `aulaviva` mediante un service binding. Conserva su base D1, fotos R2, secretos, notificaciones y Durable Object. No se duplican datos ni credenciales.

La aplicación existente de Cloudflare Access debe incluir el hostname público `hazio.smp1.workers.dev` y el Worker `aulaviva`, con sus políticas originales. El Worker Hazio verifica además firma, emisor y audiencia del JWT antes de reenviar cualquier solicitud. Las URL de preview están deshabilitadas y los hostnames alternativos se rechazan.

Publicar la aplicación: `npm run deploy`.

Publicar la entrada (desde la raíz): `npx wrangler deploy --config dominio-hazio/wrangler.jsonc`.

La dirección anterior redirige las navegaciones a Hazio conservando ruta y query (incluidos QR impresos). Sus API y recursos siguen activos para instalaciones existentes. Los permisos de notificación, instalación PWA y almacenamiento del navegador son independientes en la nueva dirección: los borradores locales no se transfieren. No eliminar el Worker `aulaviva`: Hazio depende de él.

Primer despliegue: publicar la entrada Hazio antes que la aplicación para activar el destino antes de las redirecciones. Para revertir la redirección, retirar la llamada a `direccionHazio` y desplegar la aplicación; no tocar los datos.

Validación de la entrada: `node --test dominio-hazio/index.test.mjs`.
