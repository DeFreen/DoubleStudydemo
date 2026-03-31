import { useEffect, useRef, useState } from "react";

const AUTH_STORAGE_KEY = "double-lab-auth";
const PROFILES_STORAGE_KEY = "double-lab-profiles";

const resultLabels = {
  red: "Vermelho",
  black: "Preto",
  white: "Branco"
};

const payouts = {
  red: "2x",
  black: "2x",
  white: "14x"
};

const gameTitles = {
  double: "Double",
  aviator: "Aviaozinho",
  mines: "Minas"
};

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

function formatCurrency(value) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0
  }).format(value || 0);
}

function loadStoredNumber(key, fallback) {
  const raw = window.localStorage.getItem(key);
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

function loadStoredJson(key, fallback) {
  const raw = window.localStorage.getItem(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function getSessionId() {
  const saved = window.localStorage.getItem("double-lab-session");
  if (saved) return saved;
  const created = `session-${Math.random().toString(36).slice(2, 10)}`;
  window.localStorage.setItem("double-lab-session", created);
  return created;
}

function createProfileId(nickname) {
  const base = String(nickname || "perfil")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 20) || "perfil";
  return `${base}-${Math.random().toString(36).slice(2, 6)}`;
}

function getBalanceStorageKey(profileId) {
  return `double-lab-balance:${profileId || "guest"}`;
}

function getRecentBetsStorageKey(profileId) {
  return `double-lab-recent-bets:${profileId || "guest"}`;
}

function getAvatarData(name) {
  const safeName = String(name || "Mesa");
  const initials = safeName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("") || safeName.slice(0, 2).toUpperCase();
  const palette = ["sun", "ocean", "ember", "mint"];
  let hash = 0;
  for (const char of safeName) hash += char.charCodeAt(0);
  return { initials, tone: palette[hash % palette.length] };
}

function calculateMinesMultiplier(revealedCount, mineCount) {
  return Number((1 + revealedCount * (0.18 + mineCount * 0.045)).toFixed(2));
}

function createMineIndexes(mineCount) {
  const indexes = Array.from({ length: 25 }, (_, index) => index);
  for (let index = indexes.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [indexes[index], indexes[swapIndex]] = [indexes[swapIndex], indexes[index]];
  }
  return indexes.slice(0, mineCount);
}

function useSoundEffects() {
  const contextRef = useRef(null);

  function ensureContext() {
    if (!contextRef.current) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return null;
      contextRef.current = new AudioContextClass();
    }
    return contextRef.current;
  }

  function tone(frequency, duration, type = "sine", volume = 0.03, delay = 0) {
    const ctx = ensureContext();
    if (!ctx) return;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    const startAt = ctx.currentTime + delay;
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, startAt);
    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(volume, startAt + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start(startAt);
    oscillator.stop(startAt + duration);
  }

  return {
    playBet() { tone(540, 0.12, "triangle", 0.04); },
    playSpin() {
      tone(180, 0.2, "sawtooth", 0.03);
      tone(240, 0.28, "triangle", 0.02, 0.12);
      tone(320, 0.4, "triangle", 0.02, 0.28);
    },
    playWin() {
      tone(440, 0.16, "triangle", 0.05);
      tone(660, 0.2, "triangle", 0.05, 0.08);
      tone(880, 0.24, "triangle", 0.04, 0.18);
    },
    playLose() {
      tone(220, 0.26, "sine", 0.04);
      tone(160, 0.32, "sine", 0.03, 0.12);
    }
  };
}

function ToastStack({ toasts }) {
  return (
    <div className="toast-stack">
      {toasts.map((toast) => (
        <div className={`toast-item ${toast.kind}`} key={toast.id}>
          <strong>{toast.kind === "success" ? "Sucesso" : toast.kind === "error" ? "Aviso" : "Mesa"}</strong>
          <span>{toast.message}</span>
        </div>
      ))}
    </div>
  );
}

function LandingScreen({ onEnter }) {
  return (
    <main className="marketing-shell">
      <section className="marketing-hero">
        <div className="marketing-copy">
          <p className="eyebrow">Estudo de produto e interface</p>
          <h1>Double Lab</h1>
          <p className="intro">
            Um laboratorio full stack com chat ao vivo, perfis locais e tres jogos demo:
            double, aviaozinho e minas.
          </p>
          <div className="marketing-actions">
            <button className="primary-button" onClick={onEnter} type="button">Entrar no laboratorio</button>
            <span className="marketing-note">Tudo em modo demo, sem dinheiro real.</span>
          </div>
        </div>
        <div className="marketing-showcase">
          <div className="showcase-card"><span>Tempo real</span><strong>WebSocket + React</strong></div>
          <div className="showcase-card"><span>Modos</span><strong>Double, Aviator e Minas</strong></div>
          <div className="showcase-card"><span>Produto</span><strong>Landing, login e mesa</strong></div>
        </div>
      </section>
    </main>
  );
}

function LoginScreen({ onBack, onCreateProfile, onLoginProfile, onRemoveProfile, savedProfiles }) {
  const [nickname, setNickname] = useState("");
  const [mode, setMode] = useState(savedProfiles.length > 0 ? "saved" : "create");

  useEffect(() => {
    if (savedProfiles.length === 0 && mode === "saved") {
      setMode("create");
    }
  }, [mode, savedProfiles.length]);

  function handleSubmit(event) {
    event.preventDefault();
    const trimmed = nickname.trim();
    if (!trimmed) return;
    onCreateProfile(trimmed);
  }

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <p className="eyebrow">Login demo</p>
        <h2>Entrar na plataforma</h2>
        <p className="intro">Escolha um perfil salvo ou crie um novo perfil local para guardar saldo demo e ultimas jogadas no navegador.</p>
        <div className="auth-toggle">
          <button className={`secondary-button ${mode === "saved" ? "is-active" : ""}`} onClick={() => setMode("saved")} type="button">Perfis salvos</button>
          <button className={`secondary-button ${mode === "create" ? "is-active" : ""}`} onClick={() => setMode("create")} type="button">Novo perfil</button>
        </div>
        {mode === "saved" && (
          <div className="saved-profiles">
            {savedProfiles.length > 0 ? (
              savedProfiles.map((profile) => (
                <article className="saved-profile-card" key={profile.id}>
                  <div className="identity-block">
                    <span className={`avatar-chip ${getAvatarData(profile.nickname).tone}`}>{getAvatarData(profile.nickname).initials}</span>
                    <div>
                      <strong>{profile.nickname}</strong>
                      <span>Perfil local salvo</span>
                    </div>
                  </div>
                  <div className="saved-profile-actions">
                    <button className="primary-button" onClick={() => onLoginProfile(profile.id)} type="button">Entrar</button>
                    <button className="ghost-button" onClick={() => onRemoveProfile(profile.id)} type="button">Excluir</button>
                  </div>
                </article>
              ))
            ) : (
              <div className="empty-state-card">
                <strong>Nenhum perfil salvo ainda.</strong>
                <span>Crie um perfil demo para guardar seu progresso local.</span>
              </div>
            )}
          </div>
        )}
        {mode === "create" && (
          <form className="auth-form" onSubmit={handleSubmit}>
            <label className="field">
              Seu nickname demo
              <input maxLength="18" onChange={(event) => setNickname(event.target.value)} placeholder="Ex.: OliveLab" type="text" value={nickname} />
            </label>
            <button className="primary-button" type="submit">Criar e entrar</button>
          </form>
        )}
        <button className="ghost-link" onClick={onBack} type="button">Voltar para a landing</button>
      </section>
    </main>
  );
}

export default function ArcadeApp() {
  const sessionIdRef = useRef(getSessionId());
  const previousPhaseRef = useRef(null);
  const previousRoundRef = useRef(null);
  const trackRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const socketRef = useRef(null);
  const toastIdRef = useRef(0);
  const sounds = useSoundEffects();

  const [savedProfiles, setSavedProfiles] = useState(() => loadStoredJson(PROFILES_STORAGE_KEY, []));
  const [screen, setScreen] = useState(() => loadStoredJson(AUTH_STORAGE_KEY, null) ? "app" : "landing");
  const [profile, setProfile] = useState(() => loadStoredJson(AUTH_STORAGE_KEY, null));
  const [activeGame, setActiveGame] = useState("double");
  const [doubleGame, setDoubleGame] = useState({
    round: 1,
    autoMode: true,
    phase: "betting",
    countdown: 12,
    history: [],
    upcoming: [],
    pools: { red: 0, black: 0, white: 0 },
    lastResult: null,
    pendingResult: null,
    chat: [],
    onlineUsers: []
  });
  const [selectedBet, setSelectedBet] = useState(null);
  const [doubleAmount, setDoubleAmount] = useState(25);
  const [balance, setBalance] = useState(() => {
    const authProfile = loadStoredJson(AUTH_STORAGE_KEY, null);
    return loadStoredNumber(getBalanceStorageKey(authProfile?.id), 1000);
  });
  const [userBet, setUserBet] = useState(null);
  const [status, setStatus] = useState("Conectando a mesa demo...");
  const [flash, setFlash] = useState("");
  const [recentBets, setRecentBets] = useState(() => {
    const authProfile = loadStoredJson(AUTH_STORAGE_KEY, null);
    return loadStoredJson(getRecentBetsStorageKey(authProfile?.id), []);
  });
  const [trackStyle, setTrackStyle] = useState({});
  const [connectionState, setConnectionState] = useState("connecting");
  const [toasts, setToasts] = useState([]);
  const [confetti, setConfetti] = useState([]);
  const [chatDraft, setChatDraft] = useState("");
  const [aviatorAmount, setAviatorAmount] = useState(25);
  const [aviator, setAviator] = useState({
    round: 1,
    phase: "idle",
    multiplier: 1,
    crashAt: 0,
    betAmount: 0,
    activeBet: false,
    history: [1.42, 2.31, 3.98, 1.15, 6.42]
  });
  const [minesAmount, setMinesAmount] = useState(25);
  const [mines, setMines] = useState({
    phase: "idle",
    mineCount: 5,
    betAmount: 0,
    multiplier: 1,
    revealed: [],
    mineIndexes: []
  });

  const authenticatedName = profile?.nickname || "Convidado";

  function pushToast(kind, message) {
    toastIdRef.current += 1;
    const id = toastIdRef.current;
    setToasts((current) => [...current, { id, kind, message }].slice(-4));
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 3200);
  }

  function appendRecentPlay(entry) {
    setRecentBets((current) => [
      { id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, ...entry },
      ...current
    ].slice(0, 10));
  }

  function persistProfiles(nextProfiles) {
    setSavedProfiles(nextProfiles);
    window.localStorage.setItem(PROFILES_STORAGE_KEY, JSON.stringify(nextProfiles));
  }

  function handleCreateProfile(nickname) {
    const trimmed = nickname.trim();
    if (!trimmed) return;
    const existing = savedProfiles.find((entry) => entry.nickname.toLowerCase() === trimmed.toLowerCase());
    const nextProfile = existing || { id: createProfileId(trimmed), nickname: trimmed, createdAt: new Date().toISOString() };
    if (!existing) persistProfiles([nextProfile, ...savedProfiles].slice(0, 6));
    setProfile(nextProfile);
    window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(nextProfile));
    setScreen("app");
    pushToast("success", `Perfil local ${nextProfile.nickname} carregado.`);
  }

  function handleLoginProfile(profileId) {
    const nextProfile = savedProfiles.find((entry) => entry.id === profileId);
    if (!nextProfile) return;
    setProfile(nextProfile);
    window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(nextProfile));
    setScreen("app");
    pushToast("success", `Perfil ${nextProfile.nickname} conectado.`);
  }

  function handleRemoveProfile(profileId) {
    const targetProfile = savedProfiles.find((entry) => entry.id === profileId);
    const nextProfiles = savedProfiles.filter((entry) => entry.id !== profileId);
    persistProfiles(nextProfiles);
    window.localStorage.removeItem(getBalanceStorageKey(profileId));
    window.localStorage.removeItem(getRecentBetsStorageKey(profileId));
    if (profile?.id === profileId) {
      setProfile(null);
      setScreen("login");
      window.localStorage.removeItem(AUTH_STORAGE_KEY);
    }
    pushToast("info", `Perfil ${targetProfile?.nickname || "demo"} removido.`);
  }

  function handleLogout() {
    setProfile(null);
    setScreen("login");
    window.localStorage.removeItem(AUTH_STORAGE_KEY);
    pushToast("info", "Perfil local encerrado.");
  }

  useEffect(() => {
    if (screen !== "app") return undefined;
    let cancelled = false;

    async function bootstrap() {
      try {
        const response = await fetch(`/api/bootstrap?sessionId=${sessionIdRef.current}`);
        const data = await response.json();
        if (cancelled) return;
        setDoubleGame(data.game);
        setUserBet(data.userBet);
        setStatus("Mesa conectada. Entre no double ou troque para outro jogo.");
      } catch {
        if (!cancelled) setStatus("Nao foi possivel carregar a mesa agora.");
      }
    }

    function connectSocket() {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const socket = new WebSocket(`${protocol}//${window.location.host}/ws?sessionId=${sessionIdRef.current}&profile=${encodeURIComponent(authenticatedName)}`);
      socketRef.current = socket;
      setConnectionState("connecting");

      socket.onopen = () => {
        if (cancelled) return;
        setConnectionState("online");
        pushToast("success", "Mesa conectada em tempo real.");
      };

      socket.onmessage = (event) => {
        const payload = JSON.parse(event.data);
        if (payload.type === "snapshot") {
          setDoubleGame(payload.game);
          setUserBet(payload.userBet);
          return;
        }
        if (payload.type === "chat-error") {
          pushToast("error", payload.message || "Nao foi possivel enviar sua mensagem.");
          return;
        }
        if (payload.type === "chat:sent") {
          setChatDraft("");
        }
      };

      socket.onclose = () => {
        if (cancelled) return;
        setConnectionState("reconnecting");
        reconnectTimeoutRef.current = window.setTimeout(connectSocket, 1800);
      };

      socket.onerror = () => {
        if (!cancelled) socket.close();
      };
    }

    bootstrap();
    connectSocket();

    return () => {
      cancelled = true;
      if (reconnectTimeoutRef.current) window.clearTimeout(reconnectTimeoutRef.current);
      if (socketRef.current) socketRef.current.close();
    };
  }, [authenticatedName, screen]);

  useEffect(() => {
    if (!profile?.id) return;
    setBalance(loadStoredNumber(getBalanceStorageKey(profile.id), 1000));
    setRecentBets(loadStoredJson(getRecentBetsStorageKey(profile.id), []));
  }, [profile]);

  useEffect(() => {
    if (!profile?.id) return;
    window.localStorage.setItem(getBalanceStorageKey(profile.id), String(balance));
  }, [balance, profile]);

  useEffect(() => {
    if (!profile?.id) return;
    window.localStorage.setItem(getRecentBetsStorageKey(profile.id), JSON.stringify(recentBets));
  }, [profile, recentBets]);

  useEffect(() => {
    if (screen !== "app") return;
    if (doubleGame.phase !== previousPhaseRef.current) {
      if (doubleGame.phase === "spinning") {
        sounds.playSpin();
        setStatus("Apostas fechadas. A fita do double esta girando.");
        pushToast("info", "Rodada do double iniciada.");
      }
      if (doubleGame.phase === "betting") {
        setStatus("Nova rodada do double aberta.");
      }
    }
    previousPhaseRef.current = doubleGame.phase;
  }, [doubleGame.phase, screen, sounds]);

  useEffect(() => {
    if (screen !== "app" || !trackRef.current) return;
    const tileWidth = window.innerWidth <= 720 ? 72 : 84;
    const step = tileWidth + 10;
    if (doubleGame.phase === "betting") {
      setTrackStyle({ transition: "none", transform: "translate3d(-180px, 0, 0)" });
      return;
    }
    if (doubleGame.phase === "spinning" && doubleGame.pendingResult) {
      const rollingIndex = symbols.findIndex((item) => item.type === doubleGame.pendingResult.type && item.label === doubleGame.pendingResult.label);
      const settleOffset = -((rollingIndex + symbols.length * 4) * step);
      setTrackStyle({ transition: "transform 0.35s ease-out", transform: "translate3d(-120px, 0, 0)" });
      window.setTimeout(() => {
        setTrackStyle({ transition: "transform 4.8s cubic-bezier(0.08, 0.82, 0.14, 1)", transform: `translate3d(${settleOffset}px, 0, 0)` });
      }, 60);
    }
  }, [doubleGame.pendingResult, doubleGame.phase, screen]);

  useEffect(() => {
    if (screen !== "app" || !doubleGame.lastResult) return;
    if (previousRoundRef.current === doubleGame.round) return;
    previousRoundRef.current = doubleGame.round;
    if (!userBet?.outcome) return;

    if (userBet.outcome.won) {
      setBalance((current) => current - userBet.amount + userBet.outcome.payout);
      sounds.playWin();
      setFlash("win");
      setStatus(`Voce venceu na ${resultLabels[doubleGame.lastResult.type]} ${doubleGame.lastResult.label}.`);
      pushToast("success", `Vitoria no double: ${resultLabels[doubleGame.lastResult.type]} ${doubleGame.lastResult.label}.`);
      appendRecentPlay({ game: "double", title: `${resultLabels[userBet.type]} ${doubleGame.lastResult.label}`, amount: userBet.outcome.payout, detail: `ganhou ${formatCurrency(userBet.outcome.payout)}` });
      setConfetti(Array.from({ length: 18 }, (_, index) => ({
        id: `${doubleGame.round}-${index}`,
        left: `${6 + index * 5}%`,
        delay: `${(index % 6) * 0.08}s`,
        duration: `${1.9 + (index % 4) * 0.22}s`
      })));
      window.setTimeout(() => setConfetti([]), 2200);
    } else {
      setBalance((current) => current - userBet.amount);
      sounds.playLose();
      setFlash("lose");
      setStatus(`Sua aposta no double nao bateu. Saiu ${resultLabels[doubleGame.lastResult.type]} ${doubleGame.lastResult.label}.`);
      pushToast("error", `Double nao bateu. Saiu ${resultLabels[doubleGame.lastResult.type]} ${doubleGame.lastResult.label}.`);
      appendRecentPlay({ game: "double", title: `${resultLabels[userBet.type]} ${doubleGame.lastResult.label}`, amount: userBet.amount, detail: `perdeu ${formatCurrency(userBet.amount)}` });
    }
    window.setTimeout(() => setFlash(""), 1100);
  }, [doubleGame.lastResult, doubleGame.round, screen, sounds, userBet]);

  useEffect(() => {
    if (screen !== "app" || aviator.phase !== "running") return undefined;
    const timer = window.setInterval(() => {
      setAviator((current) => {
        if (current.phase !== "running") return current;
        const nextMultiplier = Number((current.multiplier + 0.03 + current.multiplier * 0.012).toFixed(2));
        if (nextMultiplier >= current.crashAt) {
          if (current.activeBet) {
            sounds.playLose();
            pushToast("error", `O aviao explodiu em ${current.crashAt.toFixed(2)}x.`);
            appendRecentPlay({ game: "aviator", title: `Crash ${current.crashAt.toFixed(2)}x`, amount: current.betAmount, detail: `perdeu ${formatCurrency(current.betAmount)}` });
          }
          return { ...current, phase: "crashed", multiplier: current.crashAt, activeBet: false, history: [current.crashAt, ...current.history].slice(0, 8) };
        }
        return { ...current, multiplier: nextMultiplier };
      });
    }, 120);
    return () => window.clearInterval(timer);
  }, [aviator.phase, screen, sounds]);

  async function confirmBet() {
    if (!selectedBet) return pushToast("error", "Escolha uma cor antes de confirmar.");
    if (doubleAmount < 1) return pushToast("error", "Valor demo invalido.");
    if (doubleAmount > balance) return pushToast("error", "Saldo demo insuficiente.");
    const response = await fetch("/api/bet", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: sessionIdRef.current, type: selectedBet, amount: doubleAmount, profileName: authenticatedName })
    });
    const data = await response.json();
    if (!response.ok) {
      setStatus(data.error || "Nao foi possivel confirmar a aposta demo.");
      return pushToast("error", data.error || "Falha ao confirmar aposta demo.");
    }
    setUserBet(data.userBet);
    sounds.playBet();
    setStatus(`Aposta no double confirmada em ${resultLabels[selectedBet]} com ${formatCurrency(doubleAmount)}.`);
    pushToast("success", `Aposta confirmada em ${resultLabels[selectedBet]}.`);
  }

  async function spinNow() {
    await fetch("/api/admin/spin-now", { method: "POST" });
  }

  async function toggleAuto() {
    await fetch("/api/admin/auto-toggle", { method: "POST" });
  }

  function sendChatMessage(event) {
    event.preventDefault();
    const text = chatDraft.trim();
    if (!text) return pushToast("error", "Digite uma mensagem antes de enviar.");
    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
      return pushToast("error", "O chat ainda nao esta conectado.");
    }
    socketRef.current.send(JSON.stringify({ type: "chat:send", author: authenticatedName, text }));
  }

  function startAviatorRound() {
    if (aviatorAmount < 1) return pushToast("error", "Defina um valor valido para o aviaozinho.");
    if (aviatorAmount > balance) return pushToast("error", "Saldo demo insuficiente para o aviaozinho.");
    setBalance((current) => current - aviatorAmount);
    sounds.playBet();
    setAviator((current) => ({
      ...current,
      round: current.round + 1,
      phase: "running",
      multiplier: 1,
      crashAt: Number((1.2 + Math.random() * 5.8).toFixed(2)),
      betAmount: aviatorAmount,
      activeBet: true
    }));
    setStatus(`Voo iniciado com ${formatCurrency(aviatorAmount)}.`);
  }

  function cashoutAviator() {
    if (!aviator.activeBet || aviator.phase !== "running") return;
    const payout = Math.max(aviator.betAmount, Math.floor(aviator.betAmount * aviator.multiplier));
    setBalance((current) => current + payout);
    sounds.playWin();
    pushToast("success", `Cashout em ${aviator.multiplier.toFixed(2)}x.`);
    appendRecentPlay({ game: "aviator", title: `Cashout ${aviator.multiplier.toFixed(2)}x`, amount: payout, detail: `retornou ${formatCurrency(payout)}` });
    setAviator((current) => ({ ...current, phase: "cashed", activeBet: false, history: [current.multiplier, ...current.history].slice(0, 8) }));
  }

  function startMinesGame() {
    if (minesAmount < 1) return pushToast("error", "Defina um valor valido para minas.");
    if (minesAmount > balance) return pushToast("error", "Saldo demo insuficiente para minas.");
    setBalance((current) => current - minesAmount);
    sounds.playBet();
    setMines((current) => ({
      ...current,
      phase: "running",
      betAmount: minesAmount,
      multiplier: 1,
      revealed: [],
      mineIndexes: createMineIndexes(current.mineCount)
    }));
    setStatus(`Partida de minas iniciada com ${formatCurrency(minesAmount)}.`);
  }

  function revealMineTile(index) {
    setMines((current) => {
      if (current.phase !== "running" || current.revealed.includes(index)) return current;
      if (current.mineIndexes.includes(index)) {
        sounds.playLose();
        pushToast("error", "Voce encontrou uma mina.");
        appendRecentPlay({ game: "mines", title: `${current.mineCount} minas`, amount: current.betAmount, detail: `perdeu ${formatCurrency(current.betAmount)}` });
        return { ...current, phase: "lost", revealed: [...current.revealed, index] };
      }
      const revealed = [...current.revealed, index];
      const multiplier = calculateMinesMultiplier(revealed.length, current.mineCount);
      const totalSafeTiles = 25 - current.mineCount;
      if (revealed.length === totalSafeTiles) {
        const payout = Math.floor(current.betAmount * multiplier);
        setBalance((value) => value + payout);
        sounds.playWin();
        pushToast("success", `Tabuleiro limpo. Retorno de ${formatCurrency(payout)}.`);
        appendRecentPlay({ game: "mines", title: `${current.mineCount} minas`, amount: payout, detail: `retornou ${formatCurrency(payout)}` });
        return { ...current, phase: "won", revealed, multiplier };
      }
      return { ...current, revealed, multiplier };
    });
  }

  function cashoutMines() {
    if (mines.phase !== "running" || mines.revealed.length === 0) {
      return pushToast("error", "Abra pelo menos uma casa segura antes do cashout.");
    }
    const payout = Math.floor(mines.betAmount * mines.multiplier);
    setBalance((current) => current + payout);
    sounds.playWin();
    pushToast("success", `Cashout em minas com ${mines.multiplier.toFixed(2)}x.`);
    appendRecentPlay({ game: "mines", title: `${mines.mineCount} minas`, amount: payout, detail: `retornou ${formatCurrency(payout)}` });
    setMines((current) => ({ ...current, phase: "cashed" }));
  }

  function resetBalance() {
    setBalance(1000);
    setRecentBets([]);
    setAviator((current) => ({ ...current, phase: "idle", activeBet: false, multiplier: 1 }));
    setMines((current) => ({ ...current, phase: "idle", betAmount: 0, multiplier: 1, revealed: [], mineIndexes: [] }));
    if (profile?.id) window.localStorage.removeItem(getRecentBetsStorageKey(profile.id));
    setStatus("Saldo demo restaurado localmente.");
    pushToast("info", "Saldo demo restaurado.");
  }

  const trackSymbols = Array.from({ length: 7 }).flatMap(() => symbols);
  const doubleResult = doubleGame.lastResult;
  const colorCounts = doubleGame.history.reduce((accumulator, entry) => {
    accumulator[entry.type] += 1;
    return accumulator;
  }, { red: 0, black: 0, white: 0 });
  const latestType = doubleGame.history[0]?.type;
  const currentStreak = doubleGame.history.reduce((total, entry) => (!latestType || entry.type !== latestType ? total : total + 1), 0);
  const trendSeries = doubleGame.history.slice(0, 10).reverse();

  if (screen === "landing") {
    return (
      <>
        <ToastStack toasts={toasts} />
        <LandingScreen onEnter={() => setScreen("login")} />
      </>
    );
  }

  if (screen === "login") {
    return (
      <>
        <ToastStack toasts={toasts} />
        <LoginScreen
          onBack={() => setScreen("landing")}
          onCreateProfile={handleCreateProfile}
          onLoginProfile={handleLoginProfile}
          onRemoveProfile={handleRemoveProfile}
          savedProfiles={savedProfiles}
        />
      </>
    );
  }

  return (
    <main className={`app-shell ${flash}`}>
      {confetti.length > 0 && (
        <div className="confetti-layer" aria-hidden="true">
          {confetti.map((piece, index) => (
            <span className={`confetti-piece tone-${index % 4}`} key={piece.id} style={{ left: piece.left, animationDelay: piece.delay, animationDuration: piece.duration }} />
          ))}
        </div>
      )}
      <ToastStack toasts={toasts} />

      <section className="hero-card">
        <div className="hero-copy">
          <p className="eyebrow">Prototipo educacional full stack</p>
          <h1>Double Lab</h1>
          <p className="intro">Plataforma demo com tres jogos, chat ao vivo e saldo local compartilhado. Sem dinheiro real, sem deposito e sem operacao financeira.</p>
        </div>
        <div className="hero-stats">
          <article className="stat-card"><span>Perfil</span><strong>{authenticatedName}</strong></article>
          <article className="stat-card"><span>Saldo demo</span><strong>{formatCurrency(balance)}</strong></article>
          <article className="stat-card"><span>Modo atual</span><strong>{gameTitles[activeGame]}</strong></article>
          <article className="stat-card"><span>Conexao</span><strong>{connectionState === "online" ? "Tempo real" : connectionState === "reconnecting" ? "Reconectando" : "Conectando"}</strong></article>
          <article className="stat-card"><span>Pessoas online</span><strong>{doubleGame.onlineUsers.length}</strong></article>
          <article className="stat-card"><span>Ultima jogada</span><strong>{recentBets[0]?.game ? gameTitles[recentBets[0].game] : "Aguardando"}</strong></article>
        </div>
      </section>

      <section className="game-switcher-card">
        <div className="panel-heading">
          <div>
            <p className="section-label">Catalogo</p>
            <h3>Escolha um jogo</h3>
          </div>
          <button className="ghost-button" onClick={handleLogout} type="button">Sair</button>
        </div>
        <div className="game-switcher-grid">
          {["double", "aviator", "mines"].map((gameKey) => (
            <button className={`game-switch-button ${activeGame === gameKey ? "active" : ""}`} key={gameKey} onClick={() => setActiveGame(gameKey)} type="button">
              <span>{gameTitles[gameKey]}</span>
              <strong>{gameKey === "double" ? "Tempo real" : gameKey === "aviator" ? "Crash demo" : "Grid tatico"}</strong>
            </button>
          ))}
        </div>
      </section>

      {activeGame === "double" && (
        <>
          <section className="ticker-card">
            <div className="ticker-head">
              <p className="section-label">Fila de resultados</p>
              <span>{doubleGame.phase === "betting" ? "Apostas abertas" : doubleGame.phase === "spinning" ? "Rodada em andamento" : "Resultado fechado"}</span>
            </div>
            <div className="ticker-row">
              {doubleGame.upcoming.map((entry, index) => (
                <div className={`ticker-chip ${entry.type}`} key={`${entry.type}-${entry.label}-${index}`}>
                  <strong>{entry.label}</strong>
                  <small>{resultLabels[entry.type]}</small>
                </div>
              ))}
            </div>
          </section>

          <section className="game-layout">
            <div className="table-zone">
              <div className="table-top-grid">
                <section className="panel-card chat-card chat-card-inline">
                  <div className="panel-heading">
                    <div>
                      <p className="section-label">Chat ao vivo</p>
                      <h3>Conversa da mesa</h3>
                    </div>
                  </div>
                  <div className="chat-feed">
                    {doubleGame.chat.map((message) => (
                      <div className={`chat-item ${message.tone || "neutral"}`} key={message.id}>
                        <div className="identity-block">
                          <span className={`avatar-chip ${getAvatarData(message.author).tone}`}>{getAvatarData(message.author).initials}</span>
                          <strong>{message.author}</strong>
                        </div>
                        <span>{message.text}</span>
                      </div>
                    ))}
                  </div>
                  <form className="chat-compose" onSubmit={sendChatMessage}>
                    <input className="chat-input" maxLength="140" onChange={(event) => setChatDraft(event.target.value)} placeholder="Escreva para a mesa..." type="text" value={chatDraft} />
                    <button className="primary-button" type="submit">Enviar</button>
                  </form>
                </section>

                <div className="table-card">
                  <div className="table-header">
                    <div>
                      <p className="section-label">Mesa multiplayer</p>
                      <h2>Double em tempo real</h2>
                    </div>
                    <div className="countdown-pill live">
                      <span>{doubleGame.phase === "betting" ? "Fecha em" : doubleGame.phase === "spinning" ? "Rodando" : "Abre em"}</span>
                      <strong>{doubleGame.countdown}s</strong>
                    </div>
                  </div>

                  <div className="track-wrapper">
                    <div className="track-pointer" aria-hidden="true"></div>
                    <div ref={trackRef} className={`track-strip ${doubleGame.phase === "spinning" ? "spinning" : ""}`} style={trackStyle}>
                      {trackSymbols.map((entry, index) => (
                        <div className={`track-tile ${entry.type}`} key={`${entry.type}-${entry.label}-${index}`}>{entry.label}</div>
                      ))}
                    </div>
                  </div>

                  <div className="result-banner">
                    <span className={`result-dot ${doubleResult?.type || "neutral"}`}></span>
                    <strong>{doubleResult ? `Ultimo resultado: ${resultLabels[doubleResult.type]} ${doubleResult.label}` : "Aguardando fechamento da rodada."}</strong>
                  </div>

                  <div className="bet-grid">
                    {["red", "white", "black"].map((type) => (
                      <button className={`bet-card bet-${type} ${selectedBet === type ? "active" : ""}`} key={type} onClick={() => setSelectedBet(type)} type="button">
                        <span className="bet-title">{resultLabels[type]}</span>
                        <strong>{payouts[type]}</strong>
                        <small>{type === "white" ? "1 casa rara" : "7 casas"}</small>
                      </button>
                    ))}
                  </div>

                  <div className="table-footer">
                    <div className="footer-metric"><span>Total em vermelho</span><strong>{formatCurrency(doubleGame.pools.red)}</strong></div>
                    <div className="footer-metric"><span>Total em branco</span><strong>{formatCurrency(doubleGame.pools.white)}</strong></div>
                    <div className="footer-metric"><span>Total em preto</span><strong>{formatCurrency(doubleGame.pools.black)}</strong></div>
                  </div>
                </div>
              </div>
            </div>

            <aside className="side-panel">
              <section className="panel-card controls-card">
                <div className="panel-heading">
                  <div>
                    <p className="section-label">Sua aposta</p>
                    <h3>Entrar na rodada</h3>
                  </div>
                </div>
                <label className="field">
                  Valor da aposta
                  <input min="1" step="1" type="number" value={doubleAmount} onChange={(event) => setDoubleAmount(Number(event.target.value))} />
                </label>
                <div className="chip-row">
                  {[10, 25, 50, 100].map((chip) => (
                    <button className="chip" key={chip} onClick={() => setDoubleAmount((current) => current + chip)} type="button">+{chip}</button>
                  ))}
                </div>
                <div className="active-bet">{selectedBet ? `Selecao atual: ${resultLabels[selectedBet]} com ${formatCurrency(doubleAmount)}.` : "Escolha uma cor para posicionar uma aposta demo."}</div>
                <div className="control-actions">
                  <button className="primary-button" onClick={confirmBet} type="button">Confirmar aposta</button>
                  <button className="ghost-button" onClick={spinNow} type="button">Girar agora</button>
                </div>
                <div className="control-actions">
                  <button className="ghost-button" onClick={resetBalance} type="button">Resetar saldo</button>
                  <button className={`toggle-button ${doubleGame.autoMode ? "active" : ""}`} onClick={toggleAuto} type="button">{doubleGame.autoMode ? "Auto ligado" : "Auto pausado"}</button>
                </div>
                <p className="status-text">{status}</p>
              </section>

              <section className="panel-card history-card">
                <div className="panel-heading"><div><p className="section-label">Historico</p><h3>Ultimos resultados</h3></div></div>
                <div className="history-row">
                  {doubleGame.history.map((entry, index) => (
                    <div className={`history-chip ${entry.type}`} key={`${entry.type}-${entry.label}-${index}`}>{entry.label}</div>
                  ))}
                </div>
              </section>

              <section className="panel-card stats-card">
                <div className="panel-heading"><div><p className="section-label">Analise demo</p><h3>Estatisticas da mesa</h3></div></div>
                <div className="stats-grid">
                  <div className="stats-box"><span>Streak atual</span><strong>{latestType ? `${resultLabels[latestType]} x${currentStreak}` : "Sem dados"}</strong></div>
                  <div className="stats-box"><span>Vermelhos</span><strong>{colorCounts.red}</strong></div>
                  <div className="stats-box"><span>Pretos</span><strong>{colorCounts.black}</strong></div>
                  <div className="stats-box"><span>Brancos</span><strong>{colorCounts.white}</strong></div>
                </div>
                <div className="trend-chart">
                  {trendSeries.map((entry, index) => (
                    <div className={`trend-bar ${entry.type}`} key={`${entry.type}-${entry.label}-${index}`}><span>{entry.label}</span></div>
                  ))}
                </div>
              </section>

              <section className="panel-card players-card">
                <div className="panel-heading"><div><p className="section-label">Pessoas</p><h3>Online na sala</h3></div></div>
                <div className="players-feed">
                  {doubleGame.onlineUsers.length === 0 ? (
                    <p className="empty-state">Ninguem conectado no momento.</p>
                  ) : doubleGame.onlineUsers.map((player) => (
                    <div className="player-item" key={player.id}>
                      <div className="identity-block">
                        <span className={`avatar-chip ${getAvatarData(player.name).tone}`}>{getAvatarData(player.name).initials}</span>
                        <strong>{player.name}</strong>
                      </div>
                      <span className="player-badge online">Online</span>
                    </div>
                  ))}
                </div>
              </section>
            </aside>
          </section>
        </>
      )}

      {activeGame === "aviator" && (
        <section className="single-game-layout">
          <div className="table-card aviator-board">
            <div className="table-header">
              <div>
                <p className="section-label">Crash demo</p>
                <h2>Aviaozinho</h2>
              </div>
              <div className={`countdown-pill ${aviator.phase === "running" ? "live" : ""}`}>
                <span>{aviator.phase === "running" ? "Multiplicador" : aviator.phase === "crashed" ? "Crash" : "Pronto"}</span>
                <strong>{aviator.multiplier.toFixed(2)}x</strong>
              </div>
            </div>
            <div className={`aviator-sky phase-${aviator.phase}`}>
              <div className="aviator-flight-line"></div>
              <div className={`aviator-plane ${aviator.phase === "running" ? "flying" : ""}`}>A</div>
              <div className="aviator-overlay">
                <span>Rodada #{String(aviator.round).padStart(3, "0")}</span>
                <strong>{aviator.phase === "running" ? `${aviator.multiplier.toFixed(2)}x` : aviator.phase === "crashed" ? `Crash em ${aviator.crashAt.toFixed(2)}x` : "Pronto para decolar"}</strong>
              </div>
            </div>
            <div className="ticker-row">
              {aviator.history.map((entry, index) => (
                <div className={`ticker-chip ${entry >= 2 ? "red" : "black"}`} key={`${entry}-${index}`}>
                  <strong>{entry.toFixed(2)}x</strong>
                  <small>{entry >= 2 ? "voo alto" : "queda cedo"}</small>
                </div>
              ))}
            </div>
          </div>

          <aside className="side-panel">
            <section className="panel-card controls-card">
              <div className="panel-heading"><div><p className="section-label">Entrada</p><h3>Controlar voo</h3></div></div>
              <label className="field">
                Valor da aposta
                <input min="1" step="1" type="number" value={aviatorAmount} onChange={(event) => setAviatorAmount(Number(event.target.value))} />
              </label>
              <div className="chip-row">
                {[10, 25, 50, 100].map((chip) => (
                  <button className="chip" key={chip} onClick={() => setAviatorAmount((current) => current + chip)} type="button">+{chip}</button>
                ))}
              </div>
              <div className="control-actions">
                <button className="primary-button" onClick={startAviatorRound} type="button">{aviator.phase === "running" ? "Voando..." : "Iniciar voo"}</button>
                <button className="ghost-button" onClick={cashoutAviator} type="button">Cashout</button>
              </div>
              <p className="status-text">{aviator.activeBet ? `Aposta ativa de ${formatCurrency(aviator.betAmount)}.` : "Comece um voo e tente sacar antes da queda."}</p>
            </section>

            <section className="panel-card rules-card">
              <div className="panel-heading"><div><p className="section-label">Como funciona</p><h3>Regras do aviaozinho</h3></div></div>
              <ul className="rules-list">
                <li>Inicie o voo com uma aposta demo.</li>
                <li>O multiplicador sobe automaticamente enquanto o aviao esta no ar.</li>
                <li>Se sacar antes do crash, o retorno entra no saldo demo.</li>
              </ul>
            </section>
          </aside>
        </section>
      )}

      {activeGame === "mines" && (
        <section className="single-game-layout">
          <div className="table-card mines-board">
            <div className="table-header">
              <div>
                <p className="section-label">Puzzle demo</p>
                <h2>Minas</h2>
              </div>
              <div className={`countdown-pill ${mines.phase === "running" ? "live" : ""}`}>
                <span>Multiplicador</span>
                <strong>{mines.multiplier.toFixed(2)}x</strong>
              </div>
            </div>
            <div className="mines-grid">
              {Array.from({ length: 25 }, (_, index) => {
                const revealed = mines.revealed.includes(index);
                const isMine = mines.mineIndexes.includes(index);
                const showMine = revealed && isMine;
                const showSafe = revealed && !isMine;
                const exposedMine = (mines.phase === "lost" || mines.phase === "won" || mines.phase === "cashed") && isMine;
                return (
                  <button className={`mine-tile ${showMine || exposedMine ? "mine" : showSafe ? "safe" : ""}`} key={index} onClick={() => revealMineTile(index)} type="button">
                    {showMine || exposedMine ? "*" : showSafe ? "+" : "?"}
                  </button>
                );
              })}
            </div>
          </div>

          <aside className="side-panel">
            <section className="panel-card controls-card">
              <div className="panel-heading"><div><p className="section-label">Entrada</p><h3>Montar rodada</h3></div></div>
              <label className="field">
                Valor da aposta
                <input min="1" step="1" type="number" value={minesAmount} onChange={(event) => setMinesAmount(Number(event.target.value))} />
              </label>
              <label className="field">
                Quantidade de minas
                <input max="12" min="3" step="1" type="number" value={mines.mineCount} onChange={(event) => setMines((current) => ({ ...current, mineCount: Number(event.target.value) }))} />
              </label>
              <div className="control-actions">
                <button className="primary-button" onClick={startMinesGame} type="button">Iniciar partida</button>
                <button className="ghost-button" onClick={cashoutMines} type="button">Cashout</button>
              </div>
              <p className="status-text">{mines.phase === "running" ? `${mines.revealed.length} casas seguras abertas.` : "Abra casas seguras e saque antes de achar uma mina."}</p>
            </section>

            <section className="panel-card rules-card">
              <div className="panel-heading"><div><p className="section-label">Como funciona</p><h3>Regras de minas</h3></div></div>
              <ul className="rules-list">
                <li>Escolha quantas minas quer no tabuleiro.</li>
                <li>Cada casa segura aumenta o multiplicador.</li>
                <li>Voce pode sacar a qualquer momento depois da primeira casa segura.</li>
              </ul>
            </section>
          </aside>
        </section>
      )}

      <section className="bottom-grid">
        <section className="panel-card user-bets-card">
          <div className="panel-heading"><div><p className="section-label">Sessao</p><h3>Suas ultimas jogadas</h3></div></div>
          <div className="user-bets-list">
            {recentBets.length === 0 ? (
              <p className="empty-state">Nenhuma jogada demo salva ainda.</p>
            ) : recentBets.map((bet) => (
              <div className="user-bet-item" key={bet.id}>
                <strong>{gameTitles[bet.game]}</strong>
                <span>{bet.title}</span>
                <small>{bet.detail}</small>
              </div>
            ))}
          </div>
        </section>

        <section className="panel-card">
          <div className="panel-heading"><div><p className="section-label">Conta demo</p><h3>Atalhos rapidos</h3></div></div>
          <div className="control-actions">
            <button className="ghost-button" onClick={resetBalance} type="button">Resetar saldo</button>
            <button className="ghost-button" onClick={() => setActiveGame("double")} type="button">Voltar ao double</button>
          </div>
          <p className="status-text">{status}</p>
        </section>
      </section>
    </main>
  );
}
