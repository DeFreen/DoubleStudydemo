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
          <h1>Double Lab Demo</h1>
          <p className="intro">
            Uma experiencia full stack inspirada em mesas de double, com tempo real, animacao,
            chat fake, perfis locais e estrutura de produto.
          </p>
          <div className="marketing-actions">
            <button className="primary-button" onClick={onEnter} type="button">Entrar no laboratorio</button>
            <span className="marketing-note">Tudo em modo demo, sem dinheiro real.</span>
          </div>
        </div>
        <div className="marketing-showcase">
          <div className="showcase-card"><span>Tempo real</span><strong>WebSocket + React</strong></div>
          <div className="showcase-card"><span>Backend demo</span><strong>Node + Express</strong></div>
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
        <h2>Entrar na mesa</h2>
        <p className="intro">Escolha um perfil salvo ou crie um novo perfil local para manter saldo demo, ultimas apostas e preferencias no navegador.</p>

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

export default function AppShell() {
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
  const [game, setGame] = useState({
    round: 1, autoMode: true, phase: "betting", countdown: 12, history: [], upcoming: [],
    fakePlayers: [], pools: { red: 0, black: 0, white: 0 }, lastResult: null, pendingResult: null, chat: []
  });
  const [selectedBet, setSelectedBet] = useState(null);
  const [amount, setAmount] = useState(25);
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

  function pushToast(kind, message) {
    toastIdRef.current += 1;
    const id = toastIdRef.current;
    setToasts((current) => [...current, { id, kind, message }].slice(-4));
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 3200);
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
    if (!existing) {
      persistProfiles([nextProfile, ...savedProfiles].slice(0, 6));
    }
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
        setGame(data.game);
        setUserBet(data.userBet);
        setStatus("Mesa demo conectada. Escolha uma cor para entrar na rodada.");
      } catch {
        if (cancelled) return;
        setStatus("Nao foi possivel carregar a mesa demo agora.");
      }
    }

    function connectSocket() {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const socket = new WebSocket(`${protocol}//${window.location.host}/ws?sessionId=${sessionIdRef.current}`);
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
          setGame(payload.game);
          setUserBet(payload.userBet);
        }
      };

      socket.onclose = () => {
        if (cancelled) return;
        setConnectionState("reconnecting");
        reconnectTimeoutRef.current = window.setTimeout(connectSocket, 1800);
      };

      socket.onerror = () => {
        if (cancelled) return;
        setConnectionState("reconnecting");
        socket.close();
      };
    }

    bootstrap();
    connectSocket();

    return () => {
      cancelled = true;
      if (reconnectTimeoutRef.current) window.clearTimeout(reconnectTimeoutRef.current);
      if (socketRef.current) socketRef.current.close();
    };
  }, [screen]);

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
    window.localStorage.setItem(getRecentBetsStorageKey(profile.id), JSON.stringify(recentBets.slice(0, 8)));
  }, [profile, recentBets]);

  useEffect(() => {
    if (screen !== "app") return;
    if (game.phase !== previousPhaseRef.current) {
      if (game.phase === "spinning") {
        sounds.playSpin();
        setStatus("Apostas fechadas. A mesa demo esta girando.");
        pushToast("info", "Rodada iniciada. A fita esta girando.");
      }
      if (game.phase === "betting") {
        setStatus("Nova rodada aberta. Confirme uma aposta demo se quiser participar.");
        pushToast("info", "Nova rodada aberta para apostas.");
      }
    }
    previousPhaseRef.current = game.phase;
  }, [game.phase, screen, sounds]);

  useEffect(() => {
    if (screen !== "app" || !trackRef.current) return;
    const tileWidth = window.innerWidth <= 720 ? 72 : 84;
    const step = tileWidth + 10;
    if (game.phase === "betting") {
      setTrackStyle({ transition: "none", transform: "translate3d(-180px, 0, 0)" });
      return;
    }
    if (game.phase === "spinning" && game.pendingResult) {
      const rollingIndex = symbols.findIndex((item) => item.type === game.pendingResult.type && item.label === game.pendingResult.label);
      const settleOffset = -((rollingIndex + symbols.length * 4) * step);
      setTrackStyle({ transition: "transform 0.35s ease-out", transform: "translate3d(-120px, 0, 0)" });
      window.setTimeout(() => {
        setTrackStyle({ transition: "transform 4.8s cubic-bezier(0.08, 0.82, 0.14, 1)", transform: `translate3d(${settleOffset}px, 0, 0)` });
      }, 60);
    }
  }, [game.phase, game.pendingResult, screen]);

  useEffect(() => {
    if (screen !== "app" || !game.lastResult) return;
    if (previousRoundRef.current === game.round) return;
    previousRoundRef.current = game.round;
    if (userBet?.outcome) {
      if (userBet.outcome.won) {
        setBalance((current) => current - userBet.amount + userBet.outcome.payout);
        sounds.playWin();
        setFlash("win");
        setStatus(`Voce venceu na ${resultLabels[game.lastResult.type]} ${game.lastResult.label}.`);
        pushToast("success", `Vitoria em ${resultLabels[game.lastResult.type]} ${game.lastResult.label}.`);
        setConfetti(Array.from({ length: 18 }, (_, index) => ({
          id: `${game.round}-${index}`,
          left: `${6 + index * 5}%`,
          delay: `${(index % 6) * 0.08}s`,
          duration: `${1.9 + (index % 4) * 0.22}s`
        })));
        window.setTimeout(() => setConfetti([]), 2200);
      } else {
        setBalance((current) => current - userBet.amount);
        sounds.playLose();
        setFlash("lose");
        setStatus(`Sua aposta nao bateu. Saiu ${resultLabels[game.lastResult.type]} ${game.lastResult.label}.`);
        pushToast("error", `Nao bateu. Saiu ${resultLabels[game.lastResult.type]} ${game.lastResult.label}.`);
      }
      window.setTimeout(() => setFlash(""), 1100);
    }
  }, [game.lastResult, game.round, screen, sounds, userBet]);

  async function confirmBet() {
    if (!selectedBet) {
      setStatus("Selecione vermelho, branco ou preto antes de confirmar.");
      pushToast("error", "Escolha uma cor antes de confirmar.");
      return;
    }
    if (amount < 1) {
      setStatus("Digite um valor demo valido.");
      pushToast("error", "Valor demo invalido.");
      return;
    }
    if (amount > balance) {
      setStatus("O valor excede seu saldo demo.");
      pushToast("error", "Saldo demo insuficiente.");
      return;
    }
    const response = await fetch("/api/bet", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: sessionIdRef.current, type: selectedBet, amount })
    });
    const data = await response.json();
    if (!response.ok) {
      setStatus(data.error || "Nao foi possivel confirmar a aposta demo.");
      pushToast("error", data.error || "Falha ao confirmar aposta demo.");
      return;
    }
    setUserBet(data.userBet);
    sounds.playBet();
    setStatus(`Aposta demo confirmada em ${resultLabels[selectedBet]} com ${formatCurrency(amount)}.`);
    pushToast("success", `Aposta confirmada em ${resultLabels[selectedBet]}.`);
    setRecentBets((current) => [{ id: `${Date.now()}`, round: data.userBet.round, type: selectedBet, amount }, ...current].slice(0, 8));
  }

  async function spinNow() {
    await fetch("/api/admin/spin-now", { method: "POST" });
  }

  async function toggleAuto() {
    await fetch("/api/admin/auto-toggle", { method: "POST" });
  }

  function resetBalance() {
    setBalance(1000);
    setRecentBets([]);
    if (profile?.id) {
      window.localStorage.removeItem(getRecentBetsStorageKey(profile.id));
    }
    setStatus("Saldo demo restaurado localmente.");
    pushToast("info", "Saldo demo restaurado.");
  }

  const trackSymbols = Array.from({ length: 7 }).flatMap(() => symbols);
  const result = game.lastResult;
  const colorCounts = game.history.reduce((accumulator, entry) => {
    accumulator[entry.type] += 1;
    return accumulator;
  }, { red: 0, black: 0, white: 0 });
  const latestType = game.history[0]?.type;
  const currentStreak = game.history.reduce((total, entry) => (!latestType || entry.type !== latestType ? total : total + 1), 0);
  const trendSeries = game.history.slice(0, 10).reverse();
  const authenticatedName = profile?.nickname || "Convidado";

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
          <p className="intro">Mesa demo com React no frontend, Node no backend e atualizacao em tempo real. Sem dinheiro real, sem deposito, sem saque e sem operacao financeira.</p>
        </div>
        <div className="hero-stats">
          <article className="stat-card"><span>Perfil</span><strong>{authenticatedName}</strong></article>
          <article className="stat-card"><span>Saldo demo</span><strong>{formatCurrency(balance)}</strong></article>
          <article className="stat-card"><span>Ultimo resultado</span><strong>{result ? `${resultLabels[result.type]} ${result.label}` : "Aguardando"}</strong></article>
          <article className="stat-card"><span>Rodada</span><strong>#{String(game.round).padStart(3, "0")}</strong></article>
          <article className="stat-card"><span>Modo</span><strong>{game.autoMode ? "Auto demo" : "Manual demo"}</strong></article>
          <article className="stat-card"><span>Conexao</span><strong>{connectionState === "online" ? "Tempo real" : connectionState === "reconnecting" ? "Reconectando" : "Conectando"}</strong></article>
        </div>
      </section>

      <section className="ticker-card">
        <div className="ticker-head">
          <p className="section-label">Fila de resultados</p>
          <span>{game.phase === "betting" ? "Apostas abertas" : game.phase === "spinning" ? "Rodada em andamento" : "Resultado fechado"}</span>
        </div>
        <div className="ticker-row">
          {game.upcoming.map((entry, index) => (
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
                  <p className="section-label">Chat demo</p>
                  <h3>Movimento da mesa</h3>
                </div>
              </div>
              <div className="chat-feed">
                {game.chat.map((message) => (
                  <div className={`chat-item ${message.tone || "neutral"}`} key={message.id}>
                    <div className="identity-block">
                      <span className={`avatar-chip ${getAvatarData(message.author).tone}`}>{getAvatarData(message.author).initials}</span>
                      <strong>{message.author}</strong>
                    </div>
                    <span>{message.text}</span>
                  </div>
                ))}
              </div>
            </section>

            <div className="table-card">
              <div className="table-header">
                <div>
                  <p className="section-label">Mesa demo</p>
                  <h2>Double em tempo real para estudo</h2>
                </div>
                <div className="countdown-pill live">
                  <span>{game.phase === "betting" ? "Fecha em" : game.phase === "spinning" ? "Rodando" : "Abre em"}</span>
                  <strong>{game.countdown}s</strong>
                </div>
              </div>

              <div className="track-wrapper">
                <div className="track-pointer" aria-hidden="true"></div>
                <div ref={trackRef} className={`track-strip ${game.phase === "spinning" ? "spinning" : ""}`} style={trackStyle}>
                  {trackSymbols.map((entry, index) => (
                    <div className={`track-tile ${entry.type}`} key={`${entry.type}-${entry.label}-${index}`}>{entry.label}</div>
                  ))}
                </div>
              </div>

              <div className="result-banner">
                <span className={`result-dot ${result?.type || "neutral"}`}></span>
                <strong>{result ? `Ultimo resultado: ${resultLabels[result.type]} ${result.label}` : "Aguardando fechamento da rodada."}</strong>
              </div>

              <div className="bet-grid">
                {["red", "white", "black"].map((type) => (
                  <button className={`bet-card bet-${type} ${selectedBet === type ? "active" : ""}`} key={type} onClick={() => setSelectedBet(type)} type="button">
                    <span className="bet-title">{resultLabels[type]}</span>
                    <strong>{payouts[type]}</strong>
                    <small>{type === "white" ? "1 casa rara" : "14 casas"}</small>
                  </button>
                ))}
              </div>

              <div className="table-footer">
                <div className="footer-metric"><span>Total em vermelho</span><strong>{formatCurrency(game.pools.red)}</strong></div>
                <div className="footer-metric"><span>Total em branco</span><strong>{formatCurrency(game.pools.white)}</strong></div>
                <div className="footer-metric"><span>Total em preto</span><strong>{formatCurrency(game.pools.black)}</strong></div>
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
              <button className="ghost-button" onClick={handleLogout} type="button">Sair</button>
            </div>
            <label className="field">
              Valor da aposta
              <input min="1" step="1" type="number" value={amount} onChange={(event) => setAmount(Number(event.target.value))} />
            </label>
            <div className="chip-row">
              {[10, 25, 50, 100].map((chip) => (
                <button className="chip" key={chip} onClick={() => setAmount((current) => current + chip)} type="button">+{chip}</button>
              ))}
            </div>
            <div className="active-bet">{selectedBet ? `Selecao atual: ${resultLabels[selectedBet]} com ${formatCurrency(amount)}.` : "Escolha uma cor para posicionar uma aposta demo."}</div>
            <div className="control-actions">
              <button className="primary-button" onClick={confirmBet} type="button">Confirmar aposta</button>
              <button className="ghost-button" onClick={spinNow} type="button">Girar agora</button>
            </div>
            <div className="control-actions">
              <button className="ghost-button" onClick={resetBalance} type="button">Resetar saldo</button>
              <button className={`toggle-button ${game.autoMode ? "active" : ""}`} onClick={toggleAuto} type="button">{game.autoMode ? "Auto ligado" : "Auto pausado"}</button>
            </div>
            <p className="status-text">{status}</p>
          </section>

          <section className="panel-card history-card">
            <div className="panel-heading"><div><p className="section-label">Historico</p><h3>Ultimos resultados</h3></div></div>
            <div className="history-row">
              {game.history.map((entry, index) => (
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

          <section className="panel-card user-bets-card">
            <div className="panel-heading"><div><p className="section-label">Sessao</p><h3>Suas ultimas apostas</h3></div></div>
            <div className="user-bets-list">
              {recentBets.length === 0 ? (
                <p className="empty-state">Nenhuma aposta demo salva ainda.</p>
              ) : recentBets.map((bet) => (
                <div className="user-bet-item" key={bet.id}>
                  <strong>Rodada #{String(bet.round).padStart(3, "0")}</strong>
                  <span>{resultLabels[bet.type]}</span>
                  <small>{formatCurrency(bet.amount)}</small>
                </div>
              ))}
            </div>
          </section>

          <section className="panel-card players-card">
            <div className="panel-heading"><div><p className="section-label">Mesa</p><h3>Atividade demo</h3></div></div>
            <div className="players-feed">
              {game.fakePlayers.map((player) => (
                <div className="player-item" key={player.id}>
                  <div className="identity-block">
                    <span className={`avatar-chip ${getAvatarData(player.name).tone}`}>{getAvatarData(player.name).initials}</span>
                    <strong>{player.name}</strong>
                  </div>
                  <span className={`player-badge ${player.bet}`}>{resultLabels[player.bet]}</span>
                  <small>{formatCurrency(player.amount)}</small>
                  <span>{player.message}</span>
                </div>
              ))}
            </div>
          </section>
        </aside>
      </section>
    </main>
  );
}
