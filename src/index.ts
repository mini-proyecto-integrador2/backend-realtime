import 'dotenv/config'
import http from 'node:http'
import express from 'express'
import cors from 'cors'
import { Server } from 'socket.io'

const PUERTO = Number(process.env.PORT ?? 4000)

// Orígenes permitidos (frontend en Vercel y local), separados por comas.
const origenes = (process.env.CORS_ORIGINS ?? 'http://localhost:5173')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean)

const app = express()
app.use(cors({ origin: origenes }))

// Comprobación de que el servicio está vivo (la usa Render y QA).
app.get('/health', (_req, res) => {
  res.json({ estado: 'ok', servicio: 'backend-realtime', hora: new Date().toISOString() })
})

const servidor = http.createServer(app)
const io = new Server(servidor, { cors: { origin: origenes } })

io.on('connection', (socket) => {
  console.log(`Cliente conectado: ${socket.id}`)

  // Evento de prueba de la base técnica: el cliente envía «ping-base» y recibe la hora del servidor.
  socket.on('ping-base', (respuesta?: (datos: { ok: boolean; hora: string }) => void) => {
    if (typeof respuesta === 'function') respuesta({ ok: true, hora: new Date().toISOString() })
  })

  socket.on('disconnect', (motivo) => {
    console.log(`Cliente desconectado: ${socket.id} (${motivo})`)
  })
})

servidor.listen(PUERTO, () => {
  console.log(`backend-realtime escuchando en el puerto ${PUERTO}`)
})
