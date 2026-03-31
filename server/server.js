import express from "express";
import { createServer } from "node:http";
import { WebSocketServer } from "ws";
import { URL } from "node:url";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const distPath = path.join(projectRoot, "dist");

const PORT = Number(process.env.PORT) || 3001;
const HOST = "0.0.0.0";
const phaseSeconds = { betting: 12, spinning: 5, result: 3 };
const payoutMap = { red: 2, black: 2, white: 14 };
const CHAT_MAX_LENGTH = 140;
const CHAT_COOLDOWN_MS = 1800;

const symbols = [
  { type: "red", label: "2" },
  { type: "black", label: "8" },
  { type: "red", label: "3" },
  { type: "black", label: "10" },
  { type: "red", label: "4" },
  { type: "black", label: "11" },
  { type: "red", label: "5" },
  { type: "black", label: "12" },
  { type: "white", label: "0" },
  { type: "red", label: "1" },
  { type: "black", label: "13" },
  { type: "red", label: "6" },
  { type: "black", label: "14" },
  { type: "red", label: "7" },
  { type: "black", label: "9" }
];

const demoNames = [
  "Luna77", "RafaXP", "BlackMamba", "NinaBet", "Atlas", "Caveira", "Maya", "NeonFox",
  "Jota", "Rubi", "Pixel", "Drako", "Sol", "Vortex", "Kira", "Bolt"
];

const chatTemplates = [
  "vai vir branco agora",
  "martingale do estudo ligado",
  "essa mesa ta vermelha hoje",
  "entrei leve so para testar",
  "preto vem forte nessa rodada",
  "segurando para o branco raro",
  "mais uma rodada para analisar o padrao",
  "dobrei a entrada demo agora"
];

const state = {
  round: 1,
  autoMode: true,
  phase: "betting",
  countdown: phaseSeconds.betting,
  history: [
    { type: "black", label: "8" },
    { type: "red", label: "3" },
    { type: "black", label: "12" },
    { type: "red", label: "1" },
    { type: "white", label: "0" },
    { type: "black", label: "13" },
    { type: "red", label: "6" }
  ],
  upcoming: [],
  fakePlayers: [],
  pools: { red: 0, black: 0, white: 0 },
  lastResult: null,
  pendingResult: null,
  chat: [],
  userBets: new Map()
};

app.use(express.json());
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  res.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }
  next();
});

if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getRandomResultType() {
  const random = Math.random();
  if (random < 0.4667) return "red";
  if (random < 0.9334) return "black";
  return "white";
}

function getRandomSymbolByType(type) {
  const matches = symbols.filter((item) => item.type === type);
  return matches[Math.floor(Math.random() * matches.length)];
}

function createUpcoming() {
  state.upcoming = Array.from({ length: 10 }, () => getRandomSymbolByType(getRandomResultType()));
}

function createFakePlayers() {
  state.fakePlayers = Array.from({ length: 7 }, (_, index) => {
    const bet = getRandomResultType();
    return {
      id: `${state.round}-${index}`,
      name: demoNames[(state.round + index) % demoNames.length],
      bet,
      amount: randomInt(10, 250),
      message: index % 2 === 0 ? "entrou na rodada" : "pressionando a mesa"
    };
  });
}

function pushChatMessage(author, text, tone = "neutral") {
  state.chat.unshift({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    author,
    text,
    tone
  });
  state.chat = state.chat.slice(0, 16);
}

function sanitizeChatText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/[<>]/g, "")
    .trim()
    .slice(0, CHAT_MAX_LENGTH);
}

function sanitizeNickname(value, fallback = "Convidado") {
  const sanitized = String(value || "")
    .replace(/\s+/g, " ")
    .replace(/[<>]/g, "")
    .trim()
    .slice(0, 18);
  return sanitized || fallback;
}

function sendToSocket(socket, payload) {
  if (socket.readyState === 1) {
    socket.send(JSON.stringify(payload));
  }
}

function createFakeChatBurst() {
  const count = randomInt(2, 4);

  for (let index = 0; index < count; index += 1) {
    const author = demoNames[randomInt(0, demoNames.length - 1)];
    const text = chatTemplates[randomInt(0, chatTemplates.length - 1)];
    pushChatMessage(author, text);
  }
}

function rebuildPools() {
  state.pools = { red: 0, black: 0, white: 0 };

  state.fakePlayers.forEach((player) => {
    state.pools[player.bet] += player.amount;
  });

  for (const bet of state.userBets.values()) {
    state.pools[bet.type] += bet.amount;
  }
}

function getSnapshot() {
  return {
    round: state.round,
    autoMode: state.autoMode,
    phase: state.phase,
    countdown: state.countdown,
    history: state.history,
    upcoming: state.upcoming,
    fakePlayers: state.fakePlayers,
    pools: state.pools,
    lastResult: state.lastResult,
    pendingResult: state.pendingResult,
    chat: state.chat
  };
}

function getUserState(sessionId) {
  return state.userBets.get(sessionId) || null;
}

function createClientPayload(sessionId = "") {
  return JSON.stringify({
    type: "snapshot",
    game: getSnapshot(),
    userBet: getUserState(sessionId)
  });
}

function broadcast() {
  wss.clients.forEach((client) => {
    if (client.readyState === 1) {
      client.send(createClientPayload(client.sessionId));
    }
  });
}

function openBetting() {
  state.phase = "betting";
  state.countdown = phaseSeconds.betting;
  state.pendingResult = null;
  createFakePlayers();
  createUpcoming();
  createFakeChatBurst();
  rebuildPools();
  broadcast();
}

function startSpin() {
  state.phase = "spinning";
  state.countdown = phaseSeconds.spinning;
  state.pendingResult = getRandomSymbolByType(getRandomResultType());
  broadcast();
}

function settleRound() {
  state.phase = "result";
  state.countdown = phaseSeconds.result;
  state.lastResult = state.pendingResult;
  state.history.unshift(state.pendingResult);
  state.history = state.history.slice(0, 12);

  for (const [sessionId, bet] of state.userBets.entries()) {
    const won = bet.type === state.pendingResult.type;
    state.userBets.set(sessionId, {
      ...bet,
      outcome: {
        won,
        payout: won ? bet.amount * payoutMap[bet.type] : 0
      }
    });

    pushChatMessage(
      bet.sessionId === "demo-bot" ? "Mesa" : sanitizeNickname(bet.profileName, `Sessao ${sessionId.slice(-4)}`),
      won
        ? `bateu ${state.pendingResult.label} e a entrada demo devolveu ${bet.amount * payoutMap[bet.type]}`
        : `errei no ${state.pendingResult.label}, volto na proxima`,
      won ? "win" : "lose"
    );
  }

  broadcast();
}

function nextRound() {
  state.round += 1;
  state.userBets = new Map();
  openBetting();
}

app.get("/api/bootstrap", (req, res) => {
  const sessionId = String(req.query.sessionId || "");
  res.json({
    game: getSnapshot(),
    userBet: getUserState(sessionId)
  });
});

app.post("/api/bet", (req, res) => {
  const { sessionId, type, amount, profileName } = req.body || {};

  if (!sessionId || !["red", "black", "white"].includes(type) || !Number.isFinite(amount) || amount < 1) {
    res.status(400).json({ error: "Aposta invalida." });
    return;
  }

  if (state.phase !== "betting") {
    res.status(409).json({ error: "Apostas fechadas para esta rodada." });
    return;
  }

  state.userBets.set(sessionId, {
    sessionId,
    profileName: sanitizeNickname(profileName, `Sessao ${String(sessionId).slice(-4)}`),
    type,
    amount,
    round: state.round
  });

  pushChatMessage(
    sanitizeNickname(profileName, `Sessao ${String(sessionId).slice(-4)}`),
    `entrou ${amount} no ${type === "red" ? "vermelho" : type === "black" ? "preto" : "branco"}`
  );
  rebuildPools();
  broadcast();
  res.json({ ok: true, userBet: getUserState(sessionId), pools: state.pools });
});

app.post("/api/admin/auto-toggle", (_req, res) => {
  state.autoMode = !state.autoMode;
  broadcast();
  res.json({ autoMode: state.autoMode });
});

app.post("/api/admin/spin-now", (_req, res) => {
  if (state.phase === "betting") {
    startSpin();
  }
  res.json({ ok: true, phase: state.phase });
});

if (fs.existsSync(distPath)) {
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api") || req.path.startsWith("/ws")) {
      next();
      return;
    }

    res.sendFile(path.join(distPath, "index.html"));
  });
}

wss.on("connection", (socket, request) => {
  const requestUrl = new URL(request.url, "http://localhost");
  socket.sessionId = requestUrl.searchParams.get("sessionId") || "";
  socket.profileName = sanitizeNickname(requestUrl.searchParams.get("profile"), `Sessao ${socket.sessionId.slice(-4) || "demo"}`);
  socket.lastChatAt = 0;
  socket.send(createClientPayload(socket.sessionId));

  socket.on("message", (rawMessage) => {
    let payload;

    try {
      payload = JSON.parse(String(rawMessage || "{}"));
    } catch {
      sendToSocket(socket, { type: "chat-error", message: "Mensagem invalida." });
      return;
    }

    if (payload.type !== "chat:send") {
      return;
    }

    const now = Date.now();
    const author = sanitizeNickname(payload.author, socket.profileName);
    const text = sanitizeChatText(payload.text);

    if (!text) {
      sendToSocket(socket, { type: "chat-error", message: "Digite uma mensagem antes de enviar." });
      return;
    }

    if (now - socket.lastChatAt < CHAT_COOLDOWN_MS) {
      sendToSocket(socket, { type: "chat-error", message: "Espere um instante antes de mandar outra mensagem." });
      return;
    }

    socket.lastChatAt = now;
    socket.profileName = author;
    pushChatMessage(author, text, "user");
    broadcast();
    sendToSocket(socket, { type: "chat:sent" });
  });
});

setInterval(() => {
  if (state.phase === "betting" && !state.autoMode && state.countdown === 0) {
    broadcast();
    return;
  }

  state.countdown -= 1;
  if (state.countdown >= 0) {
    broadcast();
    return;
  }

  if (state.phase === "betting") {
    startSpin();
    return;
  }

  if (state.phase === "spinning") {
    settleRound();
    return;
  }

  nextRound();
}, 1000);

openBetting();

server.listen(PORT, HOST, () => {
  console.log(`Double Lab demo server on http://${HOST}:${PORT}`);
});
