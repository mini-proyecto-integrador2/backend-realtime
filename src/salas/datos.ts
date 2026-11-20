import { db } from '../config/firebase'

// Modelo en Firestore (TS-02):
//   rooms/{salaId}                      → { id, nombre, anfitrion: { uid, username }, creada }  (lo crea backend-api)
//   rooms/{salaId}/messages/{mensajeId} → { id, salaId, autor: { uid, username }, texto, enviado }

export interface Autor {
  uid: string
  username: string
}

export interface Sala {
  id: string
  nombre: string
  anfitrion: Autor
  creada: string
}

export interface Mensaje {
  id: string
  salaId: string
  autor: Autor
  texto: string
  enviado: string
}

export async function obtenerSala(id: string): Promise<Sala | null> {
  const doc = await db.collection('rooms').doc(id).get()
  return doc.exists ? (doc.data() as Sala) : null
}

export async function obtenerUsername(uid: string): Promise<string | null> {
  const doc = await db.collection('users').doc(uid).get()
  return doc.exists ? ((doc.data() as { username?: string }).username ?? null) : null
}

export async function guardarMensaje(salaId: string, autor: Autor, texto: string): Promise<Mensaje> {
  const ref = db.collection('rooms').doc(salaId).collection('messages').doc()
  const mensaje: Mensaje = { id: ref.id, salaId, autor, texto, enviado: new Date().toISOString() }
  await ref.set(mensaje)
  return mensaje
}
