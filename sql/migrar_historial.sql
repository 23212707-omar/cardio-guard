-- Cardio Guard: copia a revisiones la ultima revision de cada paciente que aun no
-- tiene historial (para que los pacientes ya guardados no empiecen vacios).
-- Idempotente: se puede correr varias veces; no duplica filas.
-- Ejecutar DESPUES de crear_base.sql (que crea la tabla revisiones), con un administrador.

USE cardio_guard;
GO

IF OBJECT_ID(N'dbo.revisiones', N'U') IS NULL
    THROW 50001, 'Falta la tabla revisiones: ejecuta primero sql/crear_base.sql.', 1;
GO

INSERT INTO dbo.revisiones (paciente_id, fecha_revision, sistolica, diastolica, frecuencia)
SELECT p.id, p.fecha_revision, p.sistolica, p.diastolica, p.frecuencia
  FROM dbo.pacientes AS p
 WHERE p.fecha_revision IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM dbo.revisiones AS r WHERE r.paciente_id = p.id);
GO
