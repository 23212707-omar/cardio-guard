-- Cardio Guard: crea la base y la tabla de pacientes (idempotente).
-- Ejecutar en SSMS con un usuario administrador (p. ej. conexión de Windows).
-- Se puede correr varias veces sin errores: solo crea lo que falta.

IF DB_ID(N'cardio_guard') IS NULL
    CREATE DATABASE cardio_guard;
GO

USE cardio_guard;
GO

IF OBJECT_ID(N'dbo.pacientes', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.pacientes (
        orden          INT IDENTITY(1,1) NOT NULL,  -- orden de registro (listar() ordena por aquí)
        id             VARCHAR(20)  NOT NULL,
        edad           INT          NOT NULL,
        sexo           CHAR(1)      NOT NULL,
        sangre         VARCHAR(3)   NOT NULL,
        fecha_revision DATETIME2(0) NULL,           -- hora local "YYYY-MM-DD HH:MM", NULL sin revisión
        sistolica      INT          NULL,
        diastolica     INT          NULL,
        frecuencia     INT          NULL,
        CONSTRAINT PK_pacientes PRIMARY KEY (id),
        CONSTRAINT UQ_pacientes_orden UNIQUE (orden)
    );
END
GO

-- Historial: una fila por cada lectura ACEPTADA (solo valores crudos; las categorias
-- y alertas se calculan al mostrarlas). pacientes conserva solo la ultima revision.
IF OBJECT_ID(N'dbo.revisiones', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.revisiones (
        id_revision    INT IDENTITY(1,1) NOT NULL,
        paciente_id    VARCHAR(20)  NOT NULL,       -- misma longitud que pacientes.id
        fecha_revision DATETIME2(0) NOT NULL,       -- hora local "YYYY-MM-DD HH:MM"
        sistolica      INT          NOT NULL,
        diastolica     INT          NOT NULL,
        frecuencia     INT          NOT NULL,
        CONSTRAINT PK_revisiones PRIMARY KEY (id_revision),
        CONSTRAINT FK_revisiones_pacientes FOREIGN KEY (paciente_id) REFERENCES dbo.pacientes (id)
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes
               WHERE name = N'IX_revisiones_paciente' AND object_id = OBJECT_ID(N'dbo.revisiones'))
    CREATE INDEX IX_revisiones_paciente ON dbo.revisiones (paciente_id, id_revision);
GO
