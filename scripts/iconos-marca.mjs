import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const sharp = require(process.argv[2] || 'sharp');
const source = await readFile(new URL('../public/dragon-aulaviva.svg', import.meta.url), 'utf8');
const inner = source.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
const icon = (maskable = false) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="${maskable ? 0 : 104}" fill="#213b7c"/><g fill="none" color="#ffffff" transform="translate(${maskable ? 113 : 61} ${maskable ? 113 : 61}) scale(${maskable ? 2.234375 : 3.046875})">${inner}</g></svg>`;
await writeFile(new URL('../public/icono.svg', import.meta.url), icon());
for (const size of [180,192,512]) {
 await sharp(Buffer.from(icon())).resize(size,size).png().toFile(new URL(`../public/icono-${size}.png`,import.meta.url).pathname.replace(/^\/([A-Z]:)/i,'$1'));
}
await sharp(Buffer.from(icon(true))).resize(512,512).png().toFile(new URL('../public/icono-maskable-512.png',import.meta.url).pathname.replace(/^\/([A-Z]:)/i,'$1'));
for (const name of ['manifest.webmanifest','manifest-ti.webmanifest']) {
 const url = new URL(`../public/${name}`,import.meta.url);
 const manifest = JSON.parse(await readFile(url,'utf8'));
 manifest.icons = [192,512].map(size=>({src:`/icono-${size}.png?v=dragon3`,sizes:`${size}x${size}`,type:'image/png',purpose:'any'}));
 manifest.icons.push({src:'/icono-maskable-512.png?v=dragon3',sizes:'512x512',type:'image/png',purpose:'maskable'});
 await writeFile(url,JSON.stringify(manifest,null,2)+'\n');
}
const branded = source.replace('<svg ', '<svg class="dragon-aulaviva" aria-hidden="true" ');
await writeFile(new URL('../shared/marca.ts',import.meta.url),'// Generado desde public/dragon-aulaviva.svg por scripts/iconos-marca.mjs.\nexport const DRAGON_AULAVIVA = '+JSON.stringify(branded)+';\n');
console.log('Marca y cuatro iconos PNG generados; manifiestos actualizados.');
