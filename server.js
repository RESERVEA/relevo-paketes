/* ═══════════════════════════════════════════════════════════════
   RELEVO PAKETES · canal entre el muro y los pilotos
   Servidor Node normal y corriente, sin nada propietario. Vale para
   Render, Railway, Fly, un VPS o el portátil de casa.
   Una sala por equipo, identificada por el dorsal. No guarda nada en
   disco: si se reinicia, los dos lados se reconectan solos.
   ═══════════════════════════════════════════════════════════════ */
const http = require("http");
const { WebSocketServer } = require("ws");

const PUERTO = process.env.PORT || 8080;
const salas = new Map();          // codigo -> Sala

function segundosValidos(v) {
  const n = Number(v);
  if (!isFinite(n) || n <= 0) return 10;
  return Math.max(3, Math.min(60, n));
}
function normalizar(m) {
  const texto = String((m && m.texto) || "").trim().slice(0, 90);
  if (!texto) return null;
  const clases = ["box", "adelanta", "calma", "pena", "libre"];
  return {
    tipo: "msg",
    id: (m && m.id) || Math.random().toString(36).slice(2) + Date.now().toString(36),
    texto,
    clase: clases.includes(m && m.clase) ? m.clase : "libre",
    seg: segundosValidos(m && m.seg),
    en: Date.now()
  };
}

class Sala {
  constructor(codigo) {
    this.codigo = codigo;
    this.clientes = new Set();
    this.ultimo = null;
    this.estados = new Map();
  }
  reparto() {
    return {
      tipo: "presencia",
      pilotos: [...this.clientes].filter(c => c.rol === "piloto").map(c => ({ nombre: c.nombre || null })),
      muros: [...this.clientes].filter(c => c.rol === "muro").length,
      estados: [...this.estados.values()]
    };
  }
  mandar(a, obj) {
    const txt = JSON.stringify(obj);
    for (const c of this.clientes) {
      if (a !== "todos" && c.rol !== a) continue;
      if (c.ws.readyState === 1) { try { c.ws.send(txt); } catch (e) {} }
    }
  }
  cuantos(rol) { return [...this.clientes].filter(c => c.rol === rol).length; }
  entra(c) {
    /* Si el mismo piloto vuelve a entrar (por reconexión o por recargar la
       página), se echa a sus conexiones anteriores. Sin esto, el muro veía
       diez pantallas que en realidad eran el mismo móvil repetido. */
    if (c.nombre) {
      for (const v of [...this.clientes]) {
        if (v !== c && v.rol === c.rol && v.nombre === c.nombre) {
          try { v.ws.close(4000, "sustituida por una conexion nueva"); } catch (e) {}
          this.clientes.delete(v);
          this.estados.delete(v.id);
        }
      }
    }
    /* Tope de seguridad: si algo se desmadra, no se acumulan sin fin. */
    const mismos = [...this.clientes].filter(v => v.rol === c.rol);
    if (mismos.length >= 12) {
      const viejo = mismos[0];
      try { viejo.ws.close(4001, "demasiadas conexiones"); } catch (e) {}
      this.clientes.delete(viejo);
      this.estados.delete(viejo.id);
    }
    this.clientes.add(c);
    try {
      c.ws.send(JSON.stringify(this.reparto()));
      /* al piloto que llega tarde se le repite el último aviso solo si es muy
         reciente, para no revivir algo ya atendido */
      if (c.rol === "piloto" && this.ultimo && Date.now() - this.ultimo.en < 15000)
        c.ws.send(JSON.stringify(this.ultimo));
    } catch (e) {}
    this.mandar("muro", this.reparto());
  }
  sale(c) {
    this.clientes.delete(c);
    this.estados.delete(c.id);
    this.mandar("muro", this.reparto());
    if (!this.clientes.size) salas.delete(this.codigo);
  }
  recibe(c, dato) {
    let m;
    try { m = JSON.parse(dato); } catch (e) { return; }
    if (m.tipo === "msg" && c.rol === "muro") {
      const aviso = normalizar(m);
      if (!aviso) return;
      this.ultimo = aviso;
      this.mandar("piloto", aviso);
      try { c.ws.send(JSON.stringify({ tipo: "enviado", id: aviso.id, pilotos: this.cuantos("piloto") })); } catch (e) {}
      return;
    }
    if (m.tipo === "ack" && c.rol === "piloto") {
      this.mandar("muro", { tipo: "ack", id: m.id, piloto: c.nombre || m.piloto || null, en: Date.now() });
      return;
    }
    if (m.tipo === "estado" && c.rol === "piloto") {
      /* El tipo va DESPUÉS de extender el objeto: si va antes, el «estado»
         que trae el mensaje original lo pisa y el muro no lo reconoce. */
      const e = { ...m, nombre: c.nombre || m.piloto || null, en: Date.now() };
      this.estados.set(c.id, e);
      this.mandar("muro", { ...e, tipo: "estadoPiloto" });
      return;
    }
    if (m.tipo === "ping") { try { c.ws.send(JSON.stringify({ tipo: "pong" })); } catch (e) {} }
  }
}
function sala(codigo) {
  if (!salas.has(codigo)) salas.set(codigo, new Sala(codigo));
  return salas.get(codigo);
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};
const responder = (res, obj, cod = 200) => {
  res.writeHead(cod, { "Content-Type": "application/json; charset=utf-8", ...CORS });
  res.end(JSON.stringify(obj));
};
const RUTA = /^\/sala\/([A-Za-z0-9_-]{1,32})(?:\/(estado|enviar))?$/;

const servidor = http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  if (req.method === "OPTIONS") { res.writeHead(204, CORS); return res.end(); }
  if (url.pathname === "/" || url.pathname === "/salud")
    return responder(res, { ok: true, servicio: "relevo-paketes", salas: salas.size, uso: "/sala/<codigo>" });

  const m = url.pathname.match(RUTA);
  if (!m) return responder(res, { error: "ruta desconocida" }, 404);
  const s = sala(m[1]);

  if (m[2] === "estado") return responder(res, s.reparto());
  if (m[2] === "enviar" && req.method === "POST") {
    let cuerpo = "";
    req.on("data", d => { cuerpo += d; if (cuerpo.length > 4000) req.destroy(); });
    req.on("end", () => {
      let j; try { j = JSON.parse(cuerpo); } catch (e) { return responder(res, { error: "json inválido" }, 400); }
      const aviso = normalizar(j);
      if (!aviso) return responder(res, { error: "falta el texto" }, 400);
      s.ultimo = aviso;
      s.mandar("piloto", aviso);
      responder(res, { ok: true, id: aviso.id, pilotosConectados: s.cuantos("piloto") });
    });
    return;
  }
  return responder(res, { error: "hace falta websocket" }, 426);
});

const wss = new WebSocketServer({ noServer: true });
servidor.on("upgrade", (req, socket, cabeza) => {
  const url = new URL(req.url, "http://x");
  const m = url.pathname.match(RUTA);
  if (!m || m[2]) { socket.destroy(); return; }
  wss.handleUpgrade(req, socket, cabeza, ws => {
    const c = {
      ws,
      rol: url.searchParams.get("rol") === "muro" ? "muro" : "piloto",
      nombre: (url.searchParams.get("nombre") || "").slice(0, 40),
      id: Math.random().toString(36).slice(2) + Date.now().toString(36),
      vivo: true
    };
    const s = sala(m[1]);
    s.entra(c);
    ws.on("message", d => s.recibe(c, d));
    ws.on("pong", () => { c.vivo = true; });
    ws.on("close", () => s.sale(c));
    ws.on("error", () => s.sale(c));
  });
});

/* Latido: echa a los que se han quedado colgados sin avisar, cosa habitual
   cuando un móvil pierde la cobertura de golpe en mitad del circuito. */
setInterval(() => {
  for (const s of salas.values())
    for (const c of [...s.clientes]) {
      if (!c.vivo) { try { c.ws.terminate(); } catch (e) {} s.sale(c); continue; }
      c.vivo = false;
      try { c.ws.ping(); } catch (e) {}
    }
}, 12000);

servidor.listen(PUERTO, () => console.log("relevo escuchando en el puerto " + PUERTO));
module.exports = { servidor, salas, normalizar, segundosValidos };
