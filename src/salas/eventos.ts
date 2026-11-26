import type { Server, Socket } from 'socket.io'
import { auth } from '../config/firebase'
import { type Autor, guardarMensaje, obtenerSala, obtenerUsername } from './datos'

const RE_ID = /^[A-Z]{3}-\d{4}$/
const TEXTO_MAX = 500

type Respuesta = (datos: { ok: boolean; [clave: string]: unknown }) => void

interface DatosSocket {
  usuario: Autor
  salaId?: string
}

const error = (code: string, message: string) => ({ ok: false, error: { code, message } })
const nombreCanal = (salaId: string) => `sala:${salaId}`

// Handshake: el cliente se conecta con io(URL, { auth: { token: <ID token de Firebase> } }).
// Sin token válido o sin perfil, la conexión se rechaza.
export function exigirToken(io: Server) {
  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token
    if (typeof token !== 'string' || !token) return next(new Error('UNAUTHORIZED'))
    try {
      const { uid } = await auth.verifyIdToken(token)
      const username = await obtenerUsername(uid)
      if (!username) return next(new Error('PROFILE_NOT_FOUND'))
      ;(socket.data as DatosSocket).usuario = { uid, username }
      next()
    } catch {
      next(new Error('UNAUTHORIZED'))
    }
  })
}

// Lista de usuarios conectados a una sala, sin repetir a quien tenga varias pestañas abiertas.
async function presencia(io: Server, salaId: string): Promise<Autor[]> {
  const sockets = await io.in(nombreCanal(salaId)).fetchSockets()
  const unicos = new Map<string, Autor>()
  for (const s of sockets) {
    const u = (s.data as DatosSocket).usuario
    if (u) unicos.set(u.uid, u)
  }
  return [...unicos.values()]
}

async function avisarPresencia(io: Server, salaId: string) {
  io.to(nombreCanal(salaId)).emit('sala:presencia', { salaId, participantes: await presencia(io, salaId) })
}

async function salirDeSala(io: Server, socket: Socket) {
  const datos = socket.data as DatosSocket
  if (!datos.salaId) return
  const salaId = datos.salaId
  await socket.leave(nombreCanal(salaId))
  datos.salaId = undefined
  await avisarPresencia(io, salaId)
}

// La sala ya no existe: se saca del canal a todos y se limpia su sala actual.
function vaciarSala(io: Server, salaId: string) {
  const canal = nombreCanal(salaId)
  const ids = [...(io.sockets.adapter.rooms.get(canal) ?? [])]
  for (const id of ids) {
    const s = io.sockets.sockets.get(id)
    if (!s) continue
    ;(s.data as DatosSocket).salaId = undefined
    s.leave(canal)
  }
}

export function registrarEventos(io: Server, socket: Socket) {
  const datos = socket.data as DatosSocket

  // Unirse validando el ID de la sala contra Firestore.
  socket.on('sala:unirse', async (cuerpo: { salaId?: string }, responder?: Respuesta) => {
    const ok = typeof responder === 'function' ? responder : () => {}
    const salaId = String(cuerpo?.salaId ?? '').trim().toUpperCase()
    if (!RE_ID.test(salaId)) return ok(error('ROOM_NOT_FOUND', 'No existe una sala con ese ID.'))
    try {
      const sala = await obtenerSala(salaId)
      if (!sala) return ok(error('ROOM_NOT_FOUND', 'No existe una sala con ese ID.'))
      if (datos.salaId && datos.salaId !== salaId) await salirDeSala(io, socket)
      await socket.join(nombreCanal(salaId))
      datos.salaId = salaId
      const esAnfitrion = sala.anfitrion.uid === datos.usuario.uid
      ok({ ok: true, sala, esAnfitrion, participantes: await presencia(io, salaId) })
      await avisarPresencia(io, salaId)
    } catch (e) {
      console.error('Error al unirse a la sala:', e)
      ok(error('UNAVAILABLE', 'No pudimos entrar a la sala. Intenta de nuevo.'))
    }
  })

  socket.on('sala:salir', async (_cuerpo?: unknown, responder?: Respuesta) => {
    await salirDeSala(io, socket)
    if (typeof responder === 'function') responder({ ok: true })
  })

  // Mensaje de texto: se guarda en Firestore y se emite solo a la MISMA sala.
  socket.on('chat:mensaje', async (cuerpo: { texto?: string }, responder?: Respuesta) => {
    const ok = typeof responder === 'function' ? responder : () => {}
    if (!datos.salaId) return ok(error('NOT_IN_ROOM', 'Primero entra a una sala.'))
    const texto = String(cuerpo?.texto ?? '').trim()
    if (!texto) return ok(error('VALIDATION_ERROR', 'Escribe un mensaje.'))
    if (texto.length > TEXTO_MAX) {
      return ok(error('VALIDATION_ERROR', `El mensaje puede tener máximo ${TEXTO_MAX} caracteres.`))
    }
    try {
      const mensaje = await guardarMensaje(datos.salaId, datos.usuario, texto)
      io.to(nombreCanal(datos.salaId)).emit('chat:mensaje', mensaje)
      ok({ ok: true, mensaje })
    } catch (e) {
      console.error('Error al guardar el mensaje:', e)
      ok(error('UNAVAILABLE', 'No se pudo enviar el mensaje. Intenta de nuevo.'))
    }
  })

  // US-07: el anfitrión eliminó la sala por la API. El cliente avisa y el servidor lo comprueba
  // en Firestore antes de notificar a los demás participantes.
  socket.on('sala:eliminada', async (cuerpo: { salaId?: string }, responder?: Respuesta) => {
    const ok = typeof responder === 'function' ? responder : () => {}
    const salaId = String(cuerpo?.salaId ?? '').trim().toUpperCase()
    if (!datos.salaId || datos.salaId !== salaId) return ok(error('NOT_IN_ROOM', 'No estás en esa sala.'))
    try {
      if (await obtenerSala(salaId)) return ok(error('ROOM_STILL_EXISTS', 'La sala todavía existe.'))
      socket.to(nombreCanal(salaId)).emit('sala:eliminada', { salaId })
      vaciarSala(io, salaId)
      ok({ ok: true })
    } catch (e) {
      console.error('Error al avisar la eliminación de la sala:', e)
      ok(error('UNAVAILABLE', 'No pudimos avisar a los participantes.'))
    }
  })

  // US-07: se cambió el nombre de la sala por la API. Se lee el dato real de Firestore y se difunde.
  socket.on('sala:actualizada', async (cuerpo: { salaId?: string }, responder?: Respuesta) => {
    const ok = typeof responder === 'function' ? responder : () => {}
    const salaId = String(cuerpo?.salaId ?? '').trim().toUpperCase()
    if (!datos.salaId || datos.salaId !== salaId) return ok(error('NOT_IN_ROOM', 'No estás en esa sala.'))
    try {
      const sala = await obtenerSala(salaId)
      if (!sala) return ok(error('ROOM_NOT_FOUND', 'No existe una sala con ese ID.'))
      socket.to(nombreCanal(salaId)).emit('sala:actualizada', { sala })
      ok({ ok: true, sala })
    } catch (e) {
      console.error('Error al avisar la actualización de la sala:', e)
      ok(error('UNAVAILABLE', 'No pudimos avisar a los participantes.'))
    }
  })

  socket.on('disconnect', async () => {
    if (datos.salaId) await avisarPresencia(io, datos.salaId)
  })
}
