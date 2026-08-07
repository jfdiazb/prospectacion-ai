# Despliegue inicial de ALMA

Esta guía publica ALMA con el backend en Render, el frontend en Vercel y MongoDB Atlas. El primer despliegue mantiene todos los proveedores externos en modo `mock`, por lo que no envía comentarios, mensajes, respuestas de IA ni reuniones reales.

## 1. Preparar MongoDB Atlas

1. Reutiliza tu clúster de Atlas y crea un usuario de base de datos exclusivo para ALMA.
2. Autoriza en **Network Access** las direcciones de salida que Render muestre para el servicio.
3. Copia la cadena de conexión, selecciona una base como `prospectacion-ai` y guárdala; será el valor secreto de `MONGO_URI`.
4. No agregues la cadena a GitHub ni a ningún archivo `.env.example`.

## 2. Publicar el backend en Render

1. Importa el repositorio de GitHub como un Blueprint. Render detectará `render.yaml`.
2. Configura los secretos solicitados:
   - `MONGO_URI`: cadena privada de Atlas.
   - `JWT_SECRET`: valor aleatorio largo y exclusivo de producción.
   - `CORS_ORIGIN`: URL HTTPS del frontend en Vercel. Puede ajustarse después de crear el frontend.
3. Conserva `AI_MODE`, `YOUTUBE_MESSAGING_MODE`, `ZOOM_MODE`, `INSTAGRAM_MESSAGING_MODE` y `WHATSAPP_MESSAGING_MODE` en `mock`.
4. Al terminar, abre `https://<servicio-render>/health`. Debe responder `{"success":true,"status":"ok"}`.

Render asigna `PORT` automáticamente; el servidor y el healthcheck del contenedor respetan ese valor.

## 3. Publicar el frontend en Vercel

1. Importa el mismo repositorio en Vercel.
2. Establece **Root Directory** en `frontend` y deja el framework como Vite.
3. Añade `VITE_API_URL=https://<servicio-render>/api/v1` para Production, Preview y Development según corresponda.
4. Despliega y prueba registro, inicio de sesión, dashboard, prospectos y CRM.
5. Vuelve a Render, fija `CORS_ORIGIN=https://<dominio-vercel>` y redespliega el backend.

`frontend/vercel.json` conserva las rutas de React al recargar directamente `/dashboard`, `/crm` u otra pantalla.

## 4. Verificación segura

1. Confirma `/health` en Render.
2. Registra un usuario de prueba desde Vercel.
3. Comprueba que el usuario aparezca en Atlas y que el dashboard cargue sin errores CORS.
4. Ejecuta una prueba de ALMA en mock y confirma en MongoDB que la entrega indique `simulated`.
5. Revisa los logs: no deben aparecer tokens ni cadenas completas de conexión.

## 5. Activación posterior de YouTube

No cambies todavía `YOUTUBE_MESSAGING_MODE=mock`. El siguiente bloque de producción debe implementar OAuth 2.0 de servidor web, almacenamiento cifrado y renovación del refresh token, además del lector incremental de comentarios mediante `commentThreads.list`. Solo después se habilita `live` y se valida con el canal autorizado.

## Variables que debe proporcionar el operador

- `MONGO_URI`
- `JWT_SECRET`
- `CORS_ORIGIN`
- `VITE_API_URL`

Las credenciales de YouTube, Gemini y Zoom no son necesarias para este primer despliegue en mock.
