-- Pedidos de cuenta o plataforma que el docente envía desde /docente (olvidó su clave, un estudiante no
-- puede entrar…). TI los atiende desde Registrar; al atender queda una atencion_cuenta con pedido_id.
CREATE TABLE pedido_cuenta (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  accion       TEXT NOT NULL,                -- clave de ACCIONES_CUENTA en shared/cuentas.ts
  plataforma   TEXT NOT NULL,                -- clave de PLATAFORMAS
  para         TEXT NOT NULL CHECK (para IN ('yo', 'estudiante')), -- su propia cuenta o la de un estudiante
  detalle      TEXT,                         -- nombre y sección del estudiante
  descripcion  TEXT,
  email        TEXT NOT NULL,                -- el docente que lo pidió
  estado       TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'resuelto')),
  creado_en    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  resuelto_en  TEXT
);
CREATE INDEX idx_pedido_cuenta_estado ON pedido_cuenta (estado);
CREATE INDEX idx_pedido_cuenta_email ON pedido_cuenta (email);

ALTER TABLE atencion_cuenta ADD COLUMN pedido_id INTEGER REFERENCES pedido_cuenta(id);
