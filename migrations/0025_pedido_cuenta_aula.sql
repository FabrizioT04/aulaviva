-- Los pedidos de cuenta se hacen desde la página del QR de un ML: TI sabe a qué laboratorio ir
ALTER TABLE pedido_cuenta ADD COLUMN aula_id INTEGER REFERENCES aula(id);
