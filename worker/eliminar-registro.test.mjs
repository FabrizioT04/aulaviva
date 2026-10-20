import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { eliminarRegistro } from "./eliminar-registro.ts";

function entorno() {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE reporte (id INTEGER PRIMARY KEY, aula_id INTEGER);
    CREATE TABLE dano (id INTEGER PRIMARY KEY, aula_id INTEGER);
    CREATE TABLE foto_reporte (reporte_id INTEGER REFERENCES reporte(id) ON DELETE CASCADE, r2_key TEXT);
    CREATE TABLE foto_dano (dano_id INTEGER REFERENCES dano(id) ON DELETE CASCADE, r2_key TEXT);
    CREATE TABLE reporte_evento (reporte_id INTEGER REFERENCES reporte(id) ON DELETE CASCADE);
    INSERT INTO reporte VALUES (1, 307), (2, 309);
    INSERT INTO dano VALUES (1, 307), (2, 309);
    INSERT INTO foto_reporte VALUES (1, 'fallas/uno'), (2, 'fallas/dos');
    INSERT INTO foto_dano VALUES (1, 'danos/uno'), (2, 'danos/dos');
    INSERT INTO reporte_evento VALUES (1), (2);
  `);
  const archivos = [];
  const env = {
    DB: {
      prepare: (sql) => ({ bind: (...params) => ({ sql, params }) }),
      batch: async (sentencias) => {
        db.exec("BEGIN");
        try {
          const result = sentencias.map(({ sql, params }) => ({ results: db.prepare(sql).all(...params) }));
          db.exec("COMMIT");
          return result;
        } catch (e) {
          db.exec("ROLLBACK");
          throw e;
        }
      },
    },
    FOTOS: { delete: async (claves) => archivos.push(...claves) },
  };
  return { db, env, archivos };
}

for (const clase of ["reporte", "dano"]) {
  test(`elimina solo el ${clase} seleccionado y sus fotos`, async () => {
    const { db, env, archivos } = entorno();
    try {
      assert.deepEqual(await eliminarRegistro(env, clase, 1), { aulaId: 307 });
      assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM ${clase}`).get().n, 1);
      assert.equal(db.prepare(`SELECT id FROM ${clase}`).get().id, 2);
      assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM foto_${clase}`).get().n, 1);
      if (clase === "reporte") assert.equal(db.prepare("SELECT reporte_id FROM reporte_evento").get().reporte_id, 2);
      assert.deepEqual(archivos, [clase === "reporte" ? "fallas/uno" : "danos/uno"]);
      assert.equal(await eliminarRegistro(env, clase, 1), null);
      assert.equal(archivos.length, 1);
    } finally { db.close(); }
  });
}

test("un fallo de base de datos revierte las fotos y no borra archivos", async () => {
  const { db, env, archivos } = entorno();
  try {
    db.exec("CREATE TRIGGER impedir BEFORE DELETE ON reporte BEGIN SELECT RAISE(ABORT, 'fallo'); END");
    await assert.rejects(eliminarRegistro(env, "reporte", 1));
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM foto_reporte").get().n, 2);
    assert.deepEqual(archivos, []);
  } finally { db.close(); }
});

test("un fallo al limpiar archivos no oculta una eliminación ya guardada", async (t) => {
  const { db, env } = entorno();
  t.mock.method(console, "error", () => {});
  env.FOTOS.delete = async () => { throw new Error("R2 no disponible"); };
  try {
    assert.deepEqual(await eliminarRegistro(env, "reporte", 1), { aulaId: 307 });
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM reporte WHERE id = 1").get().n, 0);
  } finally { db.close(); }
});
