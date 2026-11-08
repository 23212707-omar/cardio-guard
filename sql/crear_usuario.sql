-- Cardio Guard: login y usuario de la aplicación, SOLO lectura/escritura de datos.
-- IMPORTANTE: cambia CAMBIAR_ESTA_CONTRASENA por una contraseña real ANTES de
-- ejecutar este script, y no la subas al repositorio.
-- Ejecutar después de crear_base.sql, con un usuario administrador, en SSMS.
-- (No es sa, ni db_owner: no puede crear/borrar tablas ni bases.)

USE master;
GO

IF SUSER_ID(N'cardio_guard_app') IS NULL
    CREATE LOGIN cardio_guard_app
        WITH PASSWORD = N'CAMBIAR_ESTA_CONTRASENA', CHECK_POLICY = ON;
GO

USE cardio_guard;
GO

IF USER_ID(N'cardio_guard_app') IS NULL
    CREATE USER cardio_guard_app FOR LOGIN cardio_guard_app;
GO

ALTER ROLE db_datareader ADD MEMBER cardio_guard_app;
ALTER ROLE db_datawriter ADD MEMBER cardio_guard_app;
GO
