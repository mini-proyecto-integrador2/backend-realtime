import { io } from "socket.io-client";

const URL = process.env.REALTIME_URL || "https://salon-estudio-realtime.onrender.com";
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
    s.on("connect", () => resolve({ s }));
    s.on("connect_error", (e) => {
      s.close();
      resolve({ error: e.message });
    });
  });

// 1. Sin token la conexión se rechaza.
const sinToken = await conectar("");
verificar("Conexión sin token rechazada", sinToken.error === "UNAUTHORIZED", sinToken.error);

// 2. Tres conexiones: usuario 1 y usuario 2 en la sala A; usuario 2 (otra pestaña) en la sala B.
const a1 = (await conectar(TOKEN_1)).s;
const a2 = (await conectar(TOKEN_2)).s;
const b2 = (await conectar(TOKEN_2)).s;
verificar("Tres conexiones con token válido", Boolean(a1 && a2 && b2));
if (!(a1 && a2 && b2)) process.exit(1);

const recibidos = { a1: [], a2: [], b2: [] };
for (const [nombre, s] of Object.entries({ a1, a2, b2 })) {
  s.on("chat:mensaje", (m) => recibidos[nombre].push(m));
}
let presenciaA1 = null;
a1.on("sala:presencia", (p) => {
  presenciaA1 = p;
});

// 3. Unirse y presencia.
const r1 = await emitir(a1, "sala:unirse", { salaId: SALA_A });
const r2 = await emitir(a2, "sala:unirse", { salaId: SALA_A });
const r3 = await emitir(b2, "sala:unirse", { salaId: SALA_B });
verificar("Unirse a salas existentes", Boolean(r1.ok && r2.ok && r3.ok));
const noExiste = await emitir(a1, "sala:unirse", { salaId: "ZZZ-0000" });
verificar("Sala inexistente rechazada", noExiste.error?.code === "ROOM_NOT_FOUND");
await esperar(1000);
verificar("Presencia de la sala A con 2 participantes", presenciaA1?.participantes.length === 2);

// 4. Mensaje y aislamiento.
const env = await emitir(a1, "chat:mensaje", { texto: "Hola desde la prueba" });
await esperar(1500);
verificar("El mensaje se guarda y se confirma", Boolean(env.ok && env.mensaje?.id), env.mensaje?.id);
verificar("Llega a otro usuario de la misma sala", recibidos.a2.some((m) => m.texto === "Hola desde la prueba"));
verificar("NO llega a la sala B (aislamiento)", recibidos.b2.length === 0);

// 5. Validaciones.
const vacio = await emitir(a1, "chat:mensaje", { texto: "   " });
verificar("Mensaje vacío rechazado", vacio.error?.code === "VALIDATION_ERROR");
const largo = await emitir(a1, "chat:mensaje", { texto: "x".repeat(501) });
verificar("Mensaje de más de 500 caracteres rechazado", largo.error?.code === "VALIDATION_ERROR");

// 6. Desconexión.
a2.close();
await esperar(1500);
verificar("Al desconectarse alguien, la presencia se actualiza", presenciaA1?.participantes.length === 1);

[a1, b2].forEach((s) => s.close());
console.log(fallos ? `\n${fallos} verificación(es) fallaron` : "\nTodo OK");
process.exit(fallos ? 1 : 0);