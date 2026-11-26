import { io } from "socket.io-client";

const URL = process.env.REALTIME_URL || "http://localhost:4000";
const API = process.env.API_URL || "https://backend-api-aodp.onrender.com/api";
const { TOKEN_1, TOKEN_2, SALA_A, SALA_B } = process.env;

let fallos = 0;
const verificar = (nombre, condicion, detalle = "") => {
  if (!condicion) fallos++;
  console.log(`${condicion ? "OK   " : "FALLA"} ${nombre}${detalle ? " -> " + detalle : ""}`);
};
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const emitir = (s, evento, datos) => new Promise((res) => s.emit(evento, datos, res));
const conectar = (token) =>
  new Promise((resolve) => {
    const s = io(URL, { auth: { token }, transports: ["websocket"], reconnection: false, timeout: 60000 });
    s.on("connect", () => resolve(s));
    s.on("connect_error", () => {
      s.close();
      resolve(null);
    });
  });
const api = (metodo, ruta, token, cuerpo) =>
  fetch(`${API}${ruta}`, {
    method: metodo,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });

// Usuario 1 (anfitrión) y usuario 2 en la sala A; usuario 2 (otra pestaña) en la sala B.
const a1 = await conectar(TOKEN_1);
const a2 = await conectar(TOKEN_2);
const b2 = await conectar(TOKEN_2);
verificar("Tres conexiones con token válido", Boolean(a1 && a2 && b2));
if (!(a1 && a2 && b2)) process.exit(1);

const eventos = { actualizadaA2: [], eliminadaA2: [], actualizadaB2: [], eliminadaB2: [] };
a2.on("sala:actualizada", (e) => eventos.actualizadaA2.push(e));
a2.on("sala:eliminada", (e) => eventos.eliminadaA2.push(e));
b2.on("sala:actualizada", (e) => eventos.actualizadaB2.push(e));
b2.on("sala:eliminada", (e) => eventos.eliminadaB2.push(e));

await emitir(a1, "sala:unirse", { salaId: SALA_A });
await emitir(a2, "sala:unirse", { salaId: SALA_A });
await emitir(b2, "sala:unirse", { salaId: SALA_B });

// sala:actualizada
const patch = await api("PATCH", `/salas/${SALA_A}`, TOKEN_1, { nombre: "Nombre editado en prueba" });
verificar("PATCH de la API responde 200", patch.status === 200, String(patch.status));
const forjado = await emitir(b2, "sala:actualizada", { salaId: SALA_A });
verificar("Quien no está en la sala no puede avisar", forjado.error?.code === "NOT_IN_ROOM");
const act = await emitir(a1, "sala:actualizada", { salaId: SALA_A });
await esperar(1000);
verificar("El anfitrión avisa y recibe el nombre real", act.ok && act.sala?.nombre === "Nombre editado en prueba");
verificar(
  "Otro participante recibe sala:actualizada",
  eventos.actualizadaA2.length === 1 && eventos.actualizadaA2[0].sala.nombre === "Nombre editado en prueba"
);
verificar("El evento no expone la lista de miembros", eventos.actualizadaA2[0] && !("miembros" in eventos.actualizadaA2[0].sala));
verificar("No llega a la sala B (aislamiento)", eventos.actualizadaB2.length === 0);

// sala:eliminada
const falsa = await emitir(a2, "sala:eliminada", { salaId: SALA_A });
verificar("No se fía del cliente: la sala aún existe", falsa.error?.code === "ROOM_STILL_EXISTS");
const del = await api("DELETE", `/salas/${SALA_A}`, TOKEN_1);
verificar("DELETE de la API responde 204", del.status === 204, String(del.status));
const aviso = await emitir(a1, "sala:eliminada", { salaId: SALA_A });
await esperar(1000);
verificar("El anfitrión avisa y se confirma", aviso.ok === true);
verificar("Otro participante recibe sala:eliminada", eventos.eliminadaA2.length === 1 && eventos.eliminadaA2[0].salaId === SALA_A);
verificar("No llega a la sala B (aislamiento)", eventos.eliminadaB2.length === 0);
const msg = await emitir(a2, "chat:mensaje", { texto: "¿Sigues ahí?" });
verificar("Tras eliminarse, ya no se puede escribir en la sala", msg.error?.code === "NOT_IN_ROOM");

// Limpieza de la sala B.
await api("DELETE", `/salas/${SALA_B}`, TOKEN_1);
[a1, a2, b2].forEach((s) => s.close());
console.log(fallos ? `\n${fallos} verificación(es) fallaron` : "\nTodo OK");
process.exit(fallos ? 1 : 0);