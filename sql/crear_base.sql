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
