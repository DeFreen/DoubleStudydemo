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
const AVIATOR_TICK_MS = 150;
const AVIATOR_WAIT_SECONDS = 6;

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
  pools: { red: 0, black: 0, white: 0 },
  lastResult: null,
  pendingResult: null,
  chat: [],
  userBets: new Map(),
  sessionProfiles: new Map(),
  arcadeHistory: {
    aviator: [],
    mines: []
  },
  aviator: {
    round: 1,
    phase: "waiting",
    countdown: AVIATOR_WAIT_SECONDS,
    multiplier: 1,
    crashAt: 2.4,
    history: [1.42, 2.31, 3.98, 1.15, 6.42],
    bets: new Map()
  }
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

function sanitizeAvatar(value, fallback = "star") {
  const allowed = new Set(["star", "rocket", "bolt", "crown", "gem", "flame"]);
  return allowed.has(value) ? value : fallback;
}

function sendToSocket(socket, payload) {
  if (socket.readyState === 1) {
    socket.send(JSON.stringify(payload));
  }
}

function getOnlineUsers() {
  const seen = new Set();
  const users = [];
  wss.clients.forEach((client) => {
    if (client.readyState !== 1 || !client.sessionId || seen.has(client.sessionId)) return;
    seen.add(client.sessionId);
    const profile = state.sessionProfiles.get(client.sessionId) || {};
    users.push({
      id: client.sessionId,
      name: sanitizeNickname(profile.name || client.profileName, `Sessao ${client.sessionId.slice(-4) || "demo"}`),
      avatar: sanitizeAvatar(profile.avatar, "star"),
      balance: Number(profile.balance) || 0
    });
  });
  return users.sort((left, right) => left.name.localeCompare(right.name, "pt-BR"));
}

function getLeaderboard() {
  return [...getOnlineUsers()]
    .sort((left, right) => right.balance - left.balance || left.name.localeCompare(right.name, "pt-BR"))
    .slice(0, 8);
}

function getAviatorUserState(sessionId) {
  return state.aviator.bets.get(sessionId) || null;
}

function getAviatorSnapshot() {
  return {
    round: state.aviator.round,
    phase: state.aviator.phase,
    countdown: state.aviator.countdown,
    multiplier: state.aviator.multiplier,
    history: state.aviator.history,
    players: [...state.aviator.bets.values()].map((bet) => ({
      sessionId: bet.sessionId,
      profileName: bet.profileName,
      avatar: bet.avatar,
      amount: bet.amount,
      status: bet.status,
      cashoutMultiplier: bet.cashoutMultiplier || null,
      payout: bet.payout || 0
    }))
  };
}

function rebuildPools() {
  state.pools = { red: 0, black: 0, white: 0 };

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
    pools: state.pools,
    lastResult: state.lastResult,
    pendingResult: state.pendingResult,
    chat: state.chat,
    onlineUsers: getOnlineUsers(),
    leaderboard: getLeaderboard(),
    aviator: getAviatorSnapshot()
  };
}

function getUserState(sessionId) {
  return state.userBets.get(sessionId) || null;
}

function pushArcadeHistory(game, entry) {
  if (!state.arcadeHistory[game]) return;
  state.arcadeHistory[game].unshift({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    createdAt: new Date().toISOString(),
    ...entry
  });
  state.arcadeHistory[game] = state.arcadeHistory[game].slice(0, 12);
}

function createClientPayload(sessionId = "") {
  return JSON.stringify({
    type: "snapshot",
    game: getSnapshot(),
    userBet: getUserState(sessionId),
    aviatorBet: getAviatorUserState(sessionId)
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
  createUpcoming();
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

function openAviatorWaiting() {
  state.aviator.phase = "waiting";
  state.aviator.countdown = AVIATOR_WAIT_SECONDS;
  state.aviator.multiplier = 1;
  state.aviator.crashAt = Number((1.2 + Math.random() * 5.8).toFixed(2));
  state.aviator.bets = new Map();
  broadcast();
}

function startAviatorRound() {
  state.aviator.phase = "running";
  state.aviator.countdown = 0;
  state.aviator.multiplier = 1;
  broadcast();
}

function settleAviatorRound() {
  state.aviator.phase = "crashed";
  state.aviator.multiplier = state.aviator.crashAt;

  for (const bet of state.aviator.bets.values()) {
    if (bet.status === "active") {
      bet.status = "lost";
      bet.payout = 0;
    }
  }

  state.aviator.history.unshift(state.aviator.crashAt);
  state.aviator.history = state.aviator.history.slice(0, 10);
  broadcast();

  setTimeout(() => {
    state.aviator.round += 1;
    openAviatorWaiting();
  }, 2600);
}

app.get("/api/bootstrap", (req, res) => {
  const sessionId = String(req.query.sessionId || "");
  res.json({
    game: getSnapshot(),
    userBet: getUserState(sessionId),
    aviatorBet: getAviatorUserState(sessionId),
    arcadeHistory: state.arcadeHistory
  });
});

app.post("/api/profile/sync", (req, res) => {
  const { sessionId, profileName, avatar, balance } = req.body || {};

  if (!sessionId) {
    res.status(400).json({ error: "Sessao invalida." });
    return;
  }

  state.sessionProfiles.set(String(sessionId), {
    name: sanitizeNickname(profileName, `Sessao ${String(sessionId).slice(-4)}`),
    avatar: sanitizeAvatar(avatar, "star"),
    balance: Number(balance) || 0
  });

  wss.clients.forEach((client) => {
    if (client.sessionId === String(sessionId)) {
      client.profileName = sanitizeNickname(profileName, client.profileName);
      client.avatar = sanitizeAvatar(avatar, client.avatar || "star");
    }
  });

  broadcast();
  res.json({ ok: true, leaderboard: getLeaderboard() });
});

app.post("/api/arcade/history", (req, res) => {
  const { game, player, title, detail, multiplier, payout } = req.body || {};

  if (!["aviator", "mines"].includes(game)) {
    res.status(400).json({ error: "Jogo invalido." });
    return;
  }

  pushArcadeHistory(game, {
    player: sanitizeNickname(player, "Convidado"),
    title: sanitizeChatText(title),
    detail: sanitizeChatText(detail),
    multiplier: Number(multiplier) || 0,
    payout: Number(payout) || 0
  });

  res.json({ ok: true, arcadeHistory: state.arcadeHistory });
});

app.post("/api/aviator/bet", (req, res) => {
  const { sessionId, amount, profileName, avatar } = req.body || {};

  if (!sessionId || !Number.isFinite(amount) || amount < 1) {
    res.status(400).json({ error: "Aposta invalida." });
    return;
  }

  if (state.aviator.phase !== "waiting") {
    res.status(409).json({ error: "A rodada do aviaozinho ja iniciou." });
    return;
  }

  state.aviator.bets.set(String(sessionId), {
    sessionId: String(sessionId),
    profileName: sanitizeNickname(profileName, `Sessao ${String(sessionId).slice(-4)}`),
    avatar: sanitizeAvatar(avatar, "star"),
    amount,
    status: "active",
    payout: 0,
    cashoutMultiplier: null
  });

  broadcast();
  res.json({ ok: true, aviatorBet: getAviatorUserState(String(sessionId)), aviator: getAviatorSnapshot() });
});

app.post("/api/aviator/cashout", (req, res) => {
  const { sessionId } = req.body || {};
  const bet = state.aviator.bets.get(String(sessionId));

  if (!bet || bet.status !== "active" || state.aviator.phase !== "running") {
    res.status(409).json({ error: "Nao ha aposta ativa para cashout." });
    return;
  }

  const cashoutMultiplier = Number(state.aviator.multiplier.toFixed(2));
  const payout = Math.max(bet.amount, Math.floor(bet.amount * cashoutMultiplier));
  bet.status = "cashed";
  bet.cashoutMultiplier = cashoutMultiplier;
  bet.payout = payout;

  broadcast();
  res.json({ ok: true, aviatorBet: bet, payout, multiplier: cashoutMultiplier });
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
  socket.avatar = sanitizeAvatar(requestUrl.searchParams.get("avatar"), "star");
  socket.lastChatAt = 0;
  state.sessionProfiles.set(socket.sessionId, {
    name: socket.profileName,
    avatar: socket.avatar,
    balance: state.sessionProfiles.get(socket.sessionId)?.balance || 0
  });
  socket.send(createClientPayload(socket.sessionId));
  broadcast();

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

  socket.on("close", () => {
    broadcast();
  });
});

setInterval(() => {
  if (state.aviator.phase === "waiting") {
    state.aviator.countdown -= 1;
    if (state.aviator.countdown <= 0) {
      startAviatorRound();
      return;
    }
    broadcast();
    return;
  }

  if (state.aviator.phase !== "running") {
    return;
  }

  const nextMultiplier = Number((state.aviator.multiplier + 0.03 + state.aviator.multiplier * 0.012).toFixed(2));
  state.aviator.multiplier = nextMultiplier;
  if (nextMultiplier >= state.aviator.crashAt) {
    settleAviatorRound();
    return;
  }
  broadcast();
}, AVIATOR_TICK_MS);

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
