# backend-realtime

Servidor de tiempo real del **Salón de Estudio Colaborativo**: Node.js + TypeScript con Socket.IO. Desde el Sprint 2 (TS-02) exige el ID token de Firebase al conectarse, permite unirse a una sala validando su ID y reenvía los mensajes de texto solo a la misma sala, guardándolos en Firestore. La señalización de WebRTC se agrega en el Sprint 4.

Proyecto Integrador I (750018C), Universidad del Valle.

## Aplicación desplegada

| Servicio | URL |
|---|---|
| Servidor de tiempo real (Render) | Se publica en el despliegue de TS-02 (servicio Docker propio en Render) |
| Estado del servicio | `<URL del servicio>/health` |

> En el plan gratuito de Render el servicio se duerme; la primera petición puede tardar hasta un minuto.

## Tecnologías

- Node.js 22 y TypeScript
- Express (comprobación de estado)
- Socket.IO (WebSockets)
- Docker (imagen multietapa) y Render

## Ejecutar en local

Requisitos: Node.js 20 o superior y Git.

```bash
git clone https://github.com/mini-proyecto-integrador2/backend-realtime.git
cd backend-realtime
npm install
cp .env.example .env     # en Windows: copy .env.example .env
npm run dev
```

Debe aparecer `backend-realtime escuchando en el puerto 4000`. Abre http://localhost:4000/health y verás `{"estado":"ok", ...}`.

### Con Docker

```bash
docker build -t backend-realtime .
docker run -p 4000:4000 --env-file .env backend-realtime
```

## Variables de entorno

| Variable | Obligatoria | Descripción |
|---|---|---|
| `PORT` | No | Puerto del servidor (4000 por defecto; Render lo define solo) |
| `CORS_ORIGINS` | En producción | Orígenes permitidos separados por comas, por ejemplo la URL del frontend en Vercel |
| `FIREBASE_SERVICE_ACCOUNT` | Sí | Cuenta de servicio de Firebase (la misma de backend-api). En local, la ruta al archivo JSON; en Render, el JSON completo |

El archivo `.env` nunca se sube al repositorio; solo `.env.example`, sin valores reales.

## Qué expone

Conexión desde el frontend:

```ts
import { io } from 'socket.io-client'
const socket = io(URL_TIEMPO_REAL, { auth: { token: await usuario.getIdToken() } })
```

Sin token válido, o si el usuario no tiene perfil, la conexión se rechaza con `connect_error` (`UNAUTHORIZED` o `PROFILE_NOT_FOUND`).

| Tipo | Nombre | Envía el cliente | Respuesta / qué recibe |
|---|---|---|---|
| HTTP GET | `/health` | — | `{ estado: "ok", servicio, hora }` |
| Evento | `ping-base` | (función de respuesta) | `{ ok, hora }` |
| Evento | `sala:unirse` | `{ salaId }` | `{ ok, sala, esAnfitrion, participantes }` o `{ ok: false, error: { code: "ROOM_NOT_FOUND" } }` |
| Evento | `sala:salir` | — | `{ ok }` |
| Evento | `chat:mensaje` | `{ texto }` (1 a 500 caracteres) | `{ ok, mensaje }`; además todos los de la misma sala reciben `chat:mensaje` con el mensaje |
| Evento (servidor) | `sala:presencia` | — | `{ salaId, participantes: [{ uid, username }] }` cada vez que alguien entra o sale |

## Modelo en Firestore

- `rooms/{salaId}`: `{ id, nombre, anfitrion: { uid, username }, creada }` (la crea backend-api con `POST /api/salas`).
- `rooms/{salaId}/messages/{mensajeId}`: `{ id, salaId, autor: { uid, username }, texto, enviado }`.
