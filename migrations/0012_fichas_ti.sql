-- Base de conocimiento: además de lo que puede probar el docente, cada ficha guarda
-- las causas posibles y el procedimiento que solo hace TI.
ALTER TABLE ficha ADD COLUMN causas_posibles TEXT;  -- ej. "Cable HDMI suelto, entrada equivocada"
ALTER TABLE ficha ADD COLUMN pasos_ti TEXT;         -- procedimiento de TI, un paso por línea
