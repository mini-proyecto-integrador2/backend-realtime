import 'dotenv/config'
import fs from 'node:fs'
import { initializeApp, cert, getApps, type ServiceAccount } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'

// Misma cuenta de servicio que backend-api: en Render el JSON completo, en local la ruta al archivo.
function cargarCredenciales(): ServiceAccount {
  const valor = process.env.FIREBASE_SERVICE_ACCOUNT
  if (!valor) throw new Error('Falta la variable de entorno FIREBASE_SERVICE_ACCOUNT')
  const json = valor.trim().startsWith('{') ? valor : fs.readFileSync(valor, 'utf-8')
  return JSON.parse(json)
}

if (!getApps().length) {
  initializeApp({ credential: cert(cargarCredenciales()) })
}

export const auth = getAuth()
export const db = getFirestore()
