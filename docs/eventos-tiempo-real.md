# Eventos de tiempo real (backend-realtime)

Servidor Socket.IO del Salón de Estudio. URL de producción: https://salon-estudio-realtime.onrender.com

## Conexión

```js
import { io } from "socket.io-client";
const socket = io(URL, { auth: { token: idTokenDeFirebase } });
```

- `token` es el ID token de Firebase del usuario (`getIdToken()`).
- Sin token válido la conexión se rechaza: el cliente recibe `connect_error` con el mensaje `UNAUTHORIZED`. Si el usuario no completó su perfil, el mensaje es `PROFILE_NOT_FOUND`.
- Los eventos con confirmación (ack) se envían con un callback: `socket.emit("evento", datos, (respuesta) => { ... })`.
- Formato de error en un ack: `{ ok: false, error: { code, message } }`.
- Render gratuito se duerme: la primera conexión puede tardar hasta un minuto.

## Tipos

| Tipo | Forma |
|---|---|
| Autor / participante | `{ uid, username }` |
| Sala | `{ id, nombre, anfitrion: Autor, creada }`. No incluye la lista de miembros. |
| Mensaje | `{ id, salaId, autor: Autor, texto, enviado }`. `enviado` es una fecha ISO. |

## Eventos que envía el cliente

| Evento | Datos | Respuesta (ack) | Errores |
|---|---|---|---|
| `sala:unirse` | `{ salaId }` | `{ ok: true, sala, esAnfitrion, participantes }` | `ROOM_NOT_FOUND`, `UNAVAILABLE` |
| `sala:salir` | ninguno | `{ ok: true }` | |
| `chat:mensaje` | `{ texto }` | `{ ok: true, mensaje }` | `NOT_IN_ROOM`, `VALIDATION_ERROR`, `UNAVAILABLE` |
| `sala:actualizada` | `{ salaId }` | `{ ok: true, sala }` | `NOT_IN_ROOM`, `ROOM_NOT_FOUND`, `UNAVAILABLE` |
| `sala:eliminada` | `{ salaId }` | `{ ok: true }` | `NOT_IN_ROOM`, `ROOM_STILL_EXISTS`, `UNAVAILABLE` |

Reglas:
- `salaId` se recorta y se pasa a mayúsculas. Si el cliente ya estaba en otra sala, sale de ella al unirse.
- `chat:mensaje`: el texto se recorta, no puede estar vacío y tiene un máximo de 500 caracteres.
- `sala:actualizada` y `sala:eliminada` solo se aceptan de un cliente que esté dentro de esa sala. El servidor no se fía del aviso: comprueba en Firestore que el nombre cambió o que la sala ya no existe, y solo entonces notifica a los demás.

## Eventos que envía el servidor

| Evento | Datos | Cuándo |
|---|---|---|
| `chat:mensaje` | `Mensaje` | Cada mensaje nuevo, a **todos** los de la sala, incluido quien lo envió. Evita duplicados comparando `id`. |
| `sala:presencia` | `{ salaId, participantes: Autor[] }` | Alguien entra, sale o se desconecta. Sin repetir a quien tenga varias pestañas. |
| `sala:actualizada` | `{ sala }` | El anfitrión cambió el nombre. No llega a quien emitió el aviso, que ya recibe la sala en su ack. |
| `sala:eliminada` | `{ salaId }` | El anfitrión eliminó la sala. No llega a quien emitió el aviso. Tras recibirlo, el cliente ya no está en la sala. |

## Aislamiento

Cada sala es un canal (`sala:{id}`). Los mensajes y los avisos solo llegan a quienes están en ese canal. Una conexión pertenece a una sola sala a la vez.

## Flujos recomendados

1. **Entrar a una sala:** `POST /api/salas/:id/unirse` (registra la membresía) y luego `sala:unirse` por socket.
2. **Historial:** `GET /api/salas/:id/mensajes?limite=50&antes=<fecha ISO>` (API REST, ver Swagger). Los mensajes nuevos llegan por `chat:mensaje`.
3. **Reconexión:** al reconectar, el cliente vuelve a emitir `sala:unirse`.
4. **Editar el nombre:** `PATCH /api/salas/:id`; con respuesta 200, emitir `sala:actualizada`.
5. **Eliminar la sala:** `DELETE /api/salas/:id`; con respuesta 204, emitir `sala:eliminada` y volver al dashboard.

## Pendiente

Señalización de WebRTC (ofertas SDP y candidatos ICE): se documenta en el Sprint 4.