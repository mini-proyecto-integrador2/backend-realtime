# backend-realtime

Servidor de tiempo real del **Salón de Estudio Colaborativo**: Node.js + TypeScript con Socket.IO. En este sprint es la base técnica (comprobación de estado y un evento de prueba); el chat, las salas y la señalización de WebRTC se agregan en los siguientes sprints.

Proyecto Integrador I (750018C), Universidad del Valle.

## Aplicación desplegada

| Servicio | URL |
|---|---|
| Servidor de tiempo real (Render) |https://backend-api-aodp.onrender.com|
| Estado del servicio |https://backend-api-aodp.onrender.com/api/health|
| Documentación Swagger |https://backend-api-aodp.onrender.com/api/docs|

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

El archivo `.env` nunca se sube al repositorio; solo `.env.example`, sin valores reales.

## Qué expone

| Tipo | Nombre | Descripción |
|---|---|---|
| HTTP GET | `/health` | Comprueba que el servicio responde |
| Evento Socket.IO | `connection` | Un cliente se conecta |
| Evento Socket.IO | `ping-base` | El cliente lo envía con una función de respuesta y recibe `{ ok, hora }` |

La documentación completa de los eventos de tiempo real se publica en un documento aparte (Sprint 6).

## Despliegue

Render, con Docker, a partir de la rama `main`. Las variables `CORS_ORIGINS` y `PORT` se configuran en el panel de Render.

## Equipo

- Jairo Hernán González Barreto
- Luis Yair Valencia Rivas
- Martín Stivensson Álvarez Quintero
