-- Por dónde llegó cada reporte del docente, para medir en el piloto qué camino usan:
--   'qr'      escaneó el QR impreso con la cámara del celular
--   'escaner' usó el botón "Escanear QR del aula" en /docente
--   'lista'   eligió el aula de la lista en /docente
-- Queda vacío en los reportes que registra TI (WhatsApp) y en los anteriores a este cambio.
ALTER TABLE reporte ADD COLUMN entrada TEXT;
