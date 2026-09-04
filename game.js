(function () {
  const Core = window.Stack99Core;

  if (!Core) {
    throw new Error("Stack99Core가 먼저 로드되어야 합니다.");
  }

  const COLORS = Object.freeze({
    navy: "#050816",
    ink: "#07102e",
    panel: "#101c4a",
    cyan: "#44f6e8",
    magenta: "#ff4fd8",
    amber: "#ffd166",
    danger: "#ff5a6f",
    text: "#eafbff",
  });

  const BOARD = Object.freeze({
    width: 1280,
    height: 720,
    playLeft: 220,
    playRight: 1060,
    baseY: 672,
    blockHeight: 34,
    initialWidth: 260,
    dropGap: 62,
    dropDuration: 150,
    spawnDelay: 130,
    cameraTop: 168,
  });

  const SPRITES = Object.freeze({
    cyanBlock: [62, 88, 231, 174],
    perfectBlock: [365, 82, 243, 184],
    feverBlock: [676, 83, 236, 183],
    startPlatform: [972, 101, 355, 203],
    fallingFragment: [60, 342, 237, 217],
    perfectBurst: [400, 336, 220, 229],
    feverLightning: [711, 331, 230, 244],
    particles: [1042, 371, 219, 167],
    clock: [74, 616, 212, 213],
    soundOn: [401, 622, 222, 201],
    soundOff: [711, 624, 221, 202],
    retry: [1058, 631, 190, 195],
    download: [74, 885, 212, 194],
  });

  const STORAGE = Object.freeze({
    best: "stack99.best.v1",
    nickname: "stack99.nickname.v1",
    muted: "stack99.muted.v1",
  });

  const dom = {};
  const state = {
    screen: "start",
    phase: "idle",
    nickname: "PLAYER",
    score: 0,
    floors: 0,
    combo: 0,
    feverCharge: 0,
    maxCombo: 0,
    perfectCount: 0,
    accuracies: [],
    tower: [],
    moving: null,
    fragments: [],
    effects: [],
    camera: 0,
    cameraTarget: 0,
    countdownUntil: 0,
    countdownLabel: "",
    goUntil: 0,
    runStartedAt: 0,
    feverUntil: 0,
    endingAt: 0,
    endReason: "miss",
    lastFrameAt: 0,
    animationFrame: 0,
    currentResult: null,
    bestResult: null,
    isNewBest: false,
    muted: true,
  };

  const assets = {
    background: new Image(),
    sprites: new Image(),
    backgroundReady: false,
    spritesReady: false,
  };

  class SoundEngine {
    constructor() {
      this.context = null;
    }

    ensureContext() {
      if (state.muted) return null;

      if (!this.context) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return null;
        this.context = new AudioContext();
      }

      if (this.context.state === "suspended") {
        this.context.resume().catch(function () {});
      }

      return this.context;
    }

    tone(frequency, duration, type, volume, delay) {
      const context = this.ensureContext();
      if (!context) return;

      const startsAt = context.currentTime + (delay || 0);
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = type || "square";
      oscillator.frequency.setValueAtTime(frequency, startsAt);
      gain.gain.setValueAtTime(0.0001, startsAt);
      gain.gain.exponentialRampToValueAtTime(volume || 0.035, startsAt + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, startsAt + duration);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(startsAt);
      oscillator.stop(startsAt + duration + 0.02);
    }

    play(name) {
      if (state.muted) return;

      if (name === "place") {
        this.tone(220, 0.07, "square", 0.03, 0);
      } else if (name === "perfect") {
        this.tone(660, 0.08, "square", 0.035, 0);
        this.tone(880, 0.1, "square", 0.03, 0.07);
      } else if (name === "fever") {
        this.tone(523, 0.08, "square", 0.035, 0);
        this.tone(659, 0.08, "square", 0.035, 0.08);
        this.tone(784, 0.16, "square", 0.04, 0.16);
      } else if (name === "miss") {
        this.tone(130, 0.18, "sawtooth", 0.04, 0);
        this.tone(82, 0.3, "square", 0.025, 0.12);
      } else if (name === "go") {
        this.tone(440, 0.08, "square", 0.025, 0);
        this.tone(880, 0.13, "square", 0.035, 0.09);
      }
    }
  }

  const sound = new SoundEngine();

  function queryDom() {
    const ids = [
      "game-canvas",
      "start-screen",
      "game-screen",
      "result-screen",
      "nickname-input",
      "start-button",
      "mute-button",
      "score-value",
      "floor-value",
      "combo-value",
      "time-value",
      "fever-panel",
      "fever-fill",
      "countdown",
      "result-card-canvas",
      "download-result",
      "retry-button",
      "change-player",
      "status-announcer",
    ];

    ids.forEach(function (id) {
      dom[toCamelCase(id)] = document.getElementById(id);
    });

    const missing = ids.filter(function (id) {
      return !document.getElementById(id);
    });

    if (missing.length) {
      throw new Error(`필수 UI 요소가 없습니다: ${missing.join(", ")}`);
    }

    dom.shell = document.querySelector(".arcade-shell") || document.body;
    dom.screens = Array.from(document.querySelectorAll(".screen"));
    dom.startForm =
      document.getElementById("start-form") || document.getElementById("player-form");
    dom.startMuteButton = document.getElementById("start-mute-button");
    dom.nicknameError = document.getElementById("nickname-error");
    dom.feverTrack = dom.feverFill.closest('[role="progressbar"]');
    dom.gameContext = dom.gameCanvas.getContext("2d", { alpha: false });
    dom.resultContext = dom.resultCardCanvas.getContext("2d");
    dom.gameCanvas.width = BOARD.width;
    dom.gameCanvas.height = BOARD.height;
    dom.resultCardCanvas.width = 1200;
    dom.resultCardCanvas.height = 675;
    dom.gameContext.imageSmoothingEnabled = false;
    dom.resultContext.imageSmoothingEnabled = false;
  }

  function toCamelCase(value) {
    return value.replace(/-([a-z])/g, function (_, letter) {
      return letter.toUpperCase();
    });
  }

  function readStorage(key, fallback) {
    try {
      const value = window.localStorage.getItem(key);
      return value === null ? fallback : value;
    } catch (error) {
      return fallback;
    }
  }

  function writeStorage(key, value) {
    try {
      window.localStorage.setItem(key, value);
      return true;
    } catch (error) {
      return false;
    }
  }

  function readBestMap() {
    try {
      const parsed = JSON.parse(readStorage(STORAGE.best, "{}"));
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (error) {
      return {};
    }
  }

  function bestKey(nickname) {
    return Core.sanitizeNickname(nickname).toLocaleLowerCase("ko-KR");
  }

  function loadBest(nickname) {
    const raw = readBestMap()[bestKey(nickname)];
    return raw ? Core.createRunResult(raw) : null;
  }

  function saveBest(result) {
    const map = readBestMap();
    map[bestKey(result.nickname)] = result;
    writeStorage(STORAGE.best, JSON.stringify(map));
  }

  function announce(message) {
    dom.statusAnnouncer.textContent = "";
    window.setTimeout(function () {
      dom.statusAnnouncer.textContent = message;
    }, 20);
  }

  function setScreen(name) {
    state.screen = name;
    dom.shell.dataset.state = name;
    const nextScreen = dom.screens.find(function (screen) {
      return screen.id === `${name}-screen`;
    });

    if (!nextScreen) return;

    nextScreen.classList.add("is-active");
    nextScreen.setAttribute("aria-hidden", "false");
    nextScreen.inert = false;

    if (name === "start") {
      dom.nicknameInput.focus();
      dom.nicknameInput.select();
    } else if (name === "game") {
      dom.gameCanvas.focus();
    } else if (name === "result") {
      dom.downloadResult.focus();
    }

    dom.screens.forEach(function (screen) {
      if (screen === nextScreen) return;
      screen.inert = true;
      screen.setAttribute("aria-hidden", "true");
      screen.classList.remove("is-active");
    });
  }

  function loadImage(image, source, onReady) {
    return new Promise(function (resolve) {
      image.onload = function () {
        onReady(true);
        resolve(true);
      };
      image.onerror = function () {
        onReady(false);
        resolve(false);
      };
      image.src = source;
    });
  }

  function updateMuteButton() {
    [dom.muteButton, dom.startMuteButton].filter(Boolean).forEach(function (button) {
      button.classList.toggle("is-muted", state.muted);
      button.setAttribute("aria-pressed", String(!state.muted));
      button.setAttribute(
        "aria-label",
        state.muted ? "효과음 켜기" : "효과음 끄기",
      );
      button.title = state.muted ? "효과음 켜기" : "효과음 끄기";

      const label = button.querySelector("[data-mute-label]");
      const icon = button.querySelector(".sound-icon");
      if (label) label.textContent = state.muted ? "SOUND OFF" : "SOUND ON";
      if (icon) icon.textContent = state.muted ? "×" : "♪";
    });
  }

  function toggleMute() {
    state.muted = !state.muted;
    writeStorage(STORAGE.muted, String(state.muted));
    updateMuteButton();
    if (!state.muted) {
      sound.ensureContext();
      sound.tone(660, 0.08, "square", 0.025, 0);
    }
  }

  function resetRun() {
    state.phase = "countdown";
    state.score = 0;
    state.floors = 0;
    state.combo = 0;
    state.feverCharge = 0;
    state.maxCombo = 0;
    state.perfectCount = 0;
    state.accuracies = [];
    state.fragments = [];
    state.effects = [];
    state.camera = 0;
    state.cameraTarget = 0;
    state.runStartedAt = 0;
    state.feverUntil = 0;
    state.endingAt = 0;
    state.endReason = "miss";
    state.currentResult = null;
    state.bestResult = null;
    state.isNewBest = false;
    state.tower = [
      {
        x: (BOARD.width - BOARD.initialWidth) / 2,
        width: BOARD.initialWidth,
        sprite: "cyanBlock",
      },
    ];
    state.moving = null;
    state.countdownUntil = performance.now() + 3000;
    setCountdownLabel("");
    state.goUntil = 0;
    updateHud(performance.now());
  }

  function startRun() {
    const rawNickname = dom.nicknameInput.value;
    const nicknameError =
      "한글·영문·숫자·공백만 사용해 2~12자로 입력해 주세요.";

    if (!Core.isValidNickname(rawNickname)) {
      dom.nicknameInput.setCustomValidity(nicknameError);
      dom.nicknameInput.reportValidity();
      if (dom.nicknameError) dom.nicknameError.textContent = nicknameError;
      return;
    }

    dom.nicknameInput.setCustomValidity("");
    if (dom.nicknameError) dom.nicknameError.textContent = "";
    state.nickname = Core.normalizeNickname(rawNickname);
    dom.nicknameInput.value = state.nickname;
    writeStorage(STORAGE.nickname, state.nickname);
    sound.ensureContext();
    resetRun();
    setScreen("game");
    announce("게임을 시작합니다. 3초 뒤 블록이 움직입니다.");
    ensureLoop();
  }

  function beginPlaying(now) {
    state.phase = "playing";
    state.runStartedAt = now;
    state.goUntil = now + 480;
    state.countdownUntil = 0;
    spawnBlock(now + 220);
    sound.play("go");
    setCountdownLabel("START");
    announce("START! Space 또는 화면 클릭으로 블록을 쌓으세요.");
  }

  function setCountdownLabel(label) {
    const nextLabel = String(label || "");
    if (state.countdownLabel === nextLabel) return;

    state.countdownLabel = nextLabel;
    dom.countdown.classList.remove("is-visible");
    dom.countdown.textContent = nextLabel;

    if (nextLabel) {
      void dom.countdown.offsetWidth;
      dom.countdown.classList.add("is-visible");
    }
  }

  function spawnBlock(readyAt) {
    const previous = state.tower[state.tower.length - 1];
    const fromRight = state.floors % 2 === 1;
    const feverActive = readyAt < state.feverUntil;
    let sprite = state.floors % 2 === 0 ? "perfectBlock" : "cyanBlock";
    if (feverActive) sprite = "feverBlock";

    state.moving = {
      width: previous.width,
      speed: Core.getSpeed(state.floors),
      fromRight,
      spawnAt: readyAt,
      readyAt,
      x: fromRight ? BOARD.playRight - previous.width : BOARD.playLeft,
      sprite,
      dropStartedAt: 0,
      lockedX: null,
    };
  }

  function movingX(block, now) {
    if (block.lockedX !== null) return block.lockedX;

    const range = Math.max(0, BOARD.playRight - BOARD.playLeft - block.width);
    if (range === 0) return BOARD.playLeft;

    const elapsedSeconds = Math.max(0, now - block.spawnAt) / 1000;
    const startPhase = block.fromRight ? range : 0;
    const cycle = range * 2;
    const phase = (startPhase + block.speed * elapsedSeconds) % cycle;
    const localX = phase <= range ? phase : cycle - phase;
    return BOARD.playLeft + localX;
  }

  function targetY() {
    return (
      BOARD.baseY -
      state.tower.length * BOARD.blockHeight +
      state.camera
    );
  }

  function getObjectScale() {
    return Core.getObjectScale(
      dom.gameCanvas.clientWidth || BOARD.width,
      dom.gameCanvas.clientHeight || BOARD.height,
      BOARD.width,
      BOARD.height,
      BOARD.playRight - BOARD.playLeft,
      0.88,
    );
  }

  function updateCameraTarget() {
    state.cameraTarget = Math.max(
      0,
      state.floors * BOARD.blockHeight -
        (BOARD.baseY - BOARD.cameraTop) / getObjectScale(),
    );
  }

  function handlePlacementInput() {
    if (state.screen !== "game" || state.phase !== "playing" || !state.moving) {
      return;
    }

    const now = performance.now();
    const deadlineAt = state.runStartedAt + Core.CONFIG.ROUND_DURATION_MS;
    if (now >= deadlineAt) {
      state.moving = null;
      startEnding("time-up", deadlineAt);
      return;
    }
    if (now < state.moving.readyAt) return;

    state.moving.lockedX = movingX(state.moving, now);
    state.moving.dropStartedAt = now;
    state.phase = "dropping";
  }

  function settlePlacement(now) {
    const moving = state.moving;
    if (!moving) return;

    const previous = state.tower[state.tower.length - 1];
    const result = Core.resolvePlacement(previous, {
      x: moving.lockedX,
      width: moving.width,
    });

    if (result.miss) {
      pushFragment(moving.lockedX, moving.width, targetY(), moving.sprite, true);
      state.moving = null;
      startEnding("miss", now);
      return;
    }

    if (result.fragment) {
      pushFragment(
        result.fragment.x,
        result.fragment.width,
        targetY(),
        moving.sprite,
        false,
      );
    }

    const wasFeverActive = now < state.feverUntil;
    const feverProgress = Core.advanceFeverCharge(
      state.feverCharge,
      result.perfect,
      wasFeverActive,
    );
    state.feverCharge = feverProgress.charge;

    if (result.perfect) {
      state.combo += 1;
      state.perfectCount += 1;
      state.maxCombo = Math.max(state.maxCombo, state.combo);
      if (feverProgress.triggered) {
        state.feverUntil = now + Core.CONFIG.FEVER_DURATION_MS;
        addEffect(
          "feverLightning",
          result.x + result.width / 2,
          targetY(),
          720,
          now,
        );
        sound.play("fever");
      } else {
        sound.play("perfect");
      }
      addEffect(
        "perfectBurst",
        result.x + result.width / 2,
        targetY(),
        430,
        now,
      );
      addNeonParticles(result.x + result.width / 2, targetY(), 15, now);
    } else {
      state.combo = 0;
      sound.play("place");
    }

    const feverActive = now < state.feverUntil;
    state.score += Core.calculateLayerScore(
      result.ratio,
      result.perfect,
      state.combo,
      feverActive,
    );
    state.accuracies.push(result.ratio * 100);
    state.floors += 1;

    let sprite = state.floors % 2 === 0 ? "cyanBlock" : "perfectBlock";
    if (feverActive) sprite = "feverBlock";
    state.tower.push({ x: result.x, width: result.width, sprite });
    updateCameraTarget();
    state.moving = null;
    state.phase = "playing";
    spawnBlock(now + BOARD.spawnDelay);
    updateHud(now);
  }

  function pushFragment(x, width, y, sprite, wholeBlock) {
    state.fragments.push({
      x,
      y,
      width: Math.max(width, 8),
      height: wholeBlock ? 52 : 40,
      sprite,
      velocityX: wholeBlock ? (Math.random() - 0.5) * 80 : (Math.random() - 0.5) * 45,
      velocityY: wholeBlock ? 30 : 10,
      rotation: 0,
      rotationSpeed: (Math.random() - 0.5) * 2.2,
      alpha: 1,
    });
  }

  function addEffect(sprite, x, y, duration, createdAt) {
    state.effects.push({
      type: "sprite",
      sprite,
      x,
      y,
      createdAt: createdAt == null ? performance.now() : createdAt,
      duration,
    });
  }

  function addNeonParticles(x, y, count, createdAt) {
    for (let index = 0; index < count; index += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 55 + Math.random() * 130;
      state.effects.push({
        type: "particle",
        x,
        y,
        velocityX: Math.cos(angle) * speed,
        velocityY: Math.sin(angle) * speed,
        size: 3 + Math.floor(Math.random() * 5),
        color: [COLORS.cyan, COLORS.magenta, COLORS.amber][
          Math.floor(Math.random() * 3)
        ],
        createdAt: createdAt == null ? performance.now() : createdAt,
        duration: 560 + Math.random() * 220,
      });
    }
  }

  function startEnding(reason, now) {
    if (state.phase === "ending" || state.phase === "finished") return;
    state.phase = "ending";
    state.endReason = reason;
    state.endingAt = now + (reason === "miss" ? 650 : 350);
    state.combo = 0;
    state.feverCharge = 0;
    state.feverUntil = 0;
    if (reason === "miss") sound.play("miss");
    updateHud(now);
    announce(reason === "time-up" ? "시간이 종료되었습니다." : "블록이 빗나갔습니다.");
  }

  function finishRun(now) {
    if (state.phase === "finished") return;
    state.phase = "finished";

    const averageAccuracy = state.accuracies.length
      ? state.accuracies.reduce(function (sum, value) {
          return sum + value;
        }, 0) / state.accuracies.length
      : 0;
    const elapsed = state.runStartedAt
      ? Math.min(now - state.runStartedAt, Core.CONFIG.ROUND_DURATION_MS)
      : 0;

    const result = Core.createRunResult({
      nickname: state.nickname,
      score: state.score,
      floors: state.floors,
      perfectCount: state.perfectCount,
      maxCombo: state.maxCombo,
      averageAccuracy,
      endReason: state.endReason,
      elapsedMs: elapsed,
      finishedAt: new Date(),
    });

    const previousBest = loadBest(state.nickname);
    state.isNewBest = !previousBest || result.score > previousBest.score;
    if (state.isNewBest) saveBest(result);
    state.currentResult = result;
    state.bestResult = state.isNewBest ? result : previousBest;
    renderResultCard(result, state.bestResult, state.isNewBest);
    setScreen("result");
    announce(
      `${state.nickname}의 이번 점수는 ${result.score.toLocaleString("ko-KR")}점입니다.`,
    );
  }

  function update(now, deltaSeconds) {
    updateCameraTarget();
    state.camera += (state.cameraTarget - state.camera) * Math.min(1, deltaSeconds * 8);

    state.fragments.forEach(function (fragment) {
      fragment.velocityY += 680 * deltaSeconds;
      fragment.x += fragment.velocityX * deltaSeconds;
      fragment.y += fragment.velocityY * deltaSeconds;
      fragment.rotation += fragment.rotationSpeed * deltaSeconds;
      if (fragment.y > BOARD.height - 40) fragment.alpha -= deltaSeconds * 2.6;
    });
    state.fragments = state.fragments.filter(function (fragment) {
      return fragment.alpha > 0 && fragment.y < BOARD.height + 150;
    });

    state.effects = state.effects.filter(function (effect) {
      return now - effect.createdAt < effect.duration;
    });

    if (state.phase === "countdown") {
      if (now >= state.countdownUntil) {
        beginPlaying(now);
      } else {
        const count = Math.ceil((state.countdownUntil - now) / 1000);
        setCountdownLabel(String(count));
      }
    } else if (state.phase === "playing" || state.phase === "dropping") {
      if (now >= state.goUntil) {
        setCountdownLabel("");
      } else {
        setCountdownLabel("START");
      }

      const deadlineAt = state.runStartedAt + Core.CONFIG.ROUND_DURATION_MS;
      let settleAt = null;
      if (state.phase === "dropping" && state.moving) {
        settleAt = state.moving.dropStartedAt + BOARD.dropDuration;
      }

      const dueEvent = Core.getDueRunEvent(deadlineAt, settleAt, now);
      if (dueEvent === "settle") {
        settlePlacement(settleAt);

        if (
          (state.phase === "playing" || state.phase === "dropping") &&
          now >= deadlineAt
        ) {
          state.moving = null;
          startEnding("time-up", deadlineAt);
        }
      } else if (dueEvent === "deadline") {
        state.moving = null;
        startEnding("time-up", deadlineAt);
      }
    } else if (state.phase === "ending" && now >= state.endingAt) {
      finishRun(now);
    }

    updateHud(now);
  }

  function updateHud(now) {
    dom.scoreValue.textContent = Core.formatScore(state.score);
    dom.floorValue.textContent = String(state.floors).padStart(2, "0");
    dom.comboValue.textContent = `x${state.combo}`;

    let remaining = Core.CONFIG.ROUND_DURATION_MS;
    if (state.runStartedAt) {
      remaining = Math.max(0, Core.CONFIG.ROUND_DURATION_MS - (now - state.runStartedAt));
    }
    dom.timeValue.textContent = Core.formatTime(remaining);

    const feverRemaining = Math.max(0, state.feverUntil - now);
    const feverActive = feverRemaining > 0;
    const feverRatio = feverActive
      ? feverRemaining / Core.CONFIG.FEVER_DURATION_MS
      : Math.min(state.feverCharge, Core.CONFIG.PERFECT_COMBO_CAP) /
        Core.CONFIG.PERFECT_COMBO_CAP;
    const feverPercent = Math.round(feverRatio * 100);
    dom.feverFill.style.width = `${Math.round(feverRatio * 100)}%`;
    dom.feverFill.style.setProperty("--fever-progress", feverRatio.toFixed(3));
    if (dom.feverTrack) {
      dom.feverTrack.setAttribute("aria-valuenow", String(feverPercent));
      dom.feverTrack.setAttribute(
        "aria-valuetext",
        feverActive
          ? `NEON FEVER ${Math.ceil(feverRemaining / 1000)}초 남음`
          : `PERFECT ${state.feverCharge} / 3`,
      );
    }
    dom.feverPanel.classList.toggle("is-active", feverActive);
    dom.feverPanel.setAttribute(
      "aria-label",
      feverActive
        ? `NEON FEVER ${Math.ceil(feverRemaining / 1000)}초 남음`
        : "NEON FEVER 준비 중",
    );
  }

  function ensureLoop() {
    if (state.animationFrame) return;
    state.lastFrameAt = performance.now();
    state.animationFrame = window.requestAnimationFrame(frame);
  }

  function frame(now) {
    state.animationFrame = 0;
    const deltaSeconds = Math.min(0.05, Math.max(0, now - state.lastFrameAt) / 1000);
    state.lastFrameAt = now;

    if (state.screen === "game") {
      update(now, deltaSeconds);
      renderGame(now);
      state.animationFrame = window.requestAnimationFrame(frame);
    }
  }

  function drawImageCover(context, image, width, height) {
    const imageRatio = image.width / image.height;
    const targetRatio = width / height;
    let sourceWidth = image.width;
    let sourceHeight = image.height;
    let sourceX = 0;
    let sourceY = 0;

    if (imageRatio > targetRatio) {
      sourceWidth = image.height * targetRatio;
      sourceX = (image.width - sourceWidth) / 2;
    } else {
      sourceHeight = image.width / targetRatio;
      sourceY = (image.height - sourceHeight) / 2;
    }

    context.drawImage(
      image,
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
      0,
      0,
      width,
      height,
    );
  }

  function drawFallbackCity(context, width, height) {
    const gradient = context.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, COLORS.navy);
    gradient.addColorStop(1, "#08143c");
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);
    context.fillStyle = "#0d1740";

    for (let index = 0; index < 15; index += 1) {
      const buildingWidth = 55 + ((index * 37) % 75);
      const buildingHeight = 90 + ((index * 61) % 190);
      const x = index * 92 - 20;
      context.fillRect(x, height - buildingHeight, buildingWidth, buildingHeight);
    }
  }

  function drawBackdrop(context) {
    if (assets.backgroundReady) {
      drawImageCover(context, assets.background, BOARD.width, BOARD.height);
    } else {
      drawFallbackCity(context, BOARD.width, BOARD.height);
    }

    const tintStrength = state.floors >= 30 ? 0.14 : state.floors >= 20 ? 0.09 : 0.04;
    context.fillStyle = `rgba(5, 8, 22, ${0.08 + tintStrength})`;
    context.fillRect(0, 0, BOARD.width, BOARD.height);

    if (performance.now() < state.feverUntil) {
      const pulse = 0.07 + Math.sin(performance.now() / 90) * 0.025;
      context.fillStyle = `rgba(255, 79, 216, ${pulse})`;
      context.fillRect(0, 0, BOARD.width, BOARD.height);
    }
  }

  function drawSprite(context, name, x, y, width, height, alpha) {
    if (!assets.spritesReady || !SPRITES[name]) {
      const fallbackColors = {
        cyanBlock: COLORS.cyan,
        perfectBlock: COLORS.magenta,
        feverBlock: COLORS.amber,
        fallingFragment: COLORS.cyan,
      };
      context.save();
      context.globalAlpha = alpha == null ? 1 : alpha;
      context.fillStyle = fallbackColors[name] || COLORS.text;
      context.fillRect(x, y, width, height);
      context.restore();
      return;
    }

    const crop = SPRITES[name];
    context.save();
    context.globalAlpha = alpha == null ? 1 : alpha;
    context.imageSmoothingEnabled = false;
    context.drawImage(
      assets.sprites,
      crop[0],
      crop[1],
      crop[2],
      crop[3],
      x,
      y,
      width,
      height,
    );
    context.restore();
  }

  function blockY(index) {
    return BOARD.baseY - index * BOARD.blockHeight + state.camera;
  }

  function drawTower(context) {
    const platformWidth = 330;
    drawSprite(
      context,
      "startPlatform",
      (BOARD.width - platformWidth) / 2,
      blockY(0) + 22,
      platformWidth,
      72,
      1,
    );

    state.tower.forEach(function (block, index) {
      const y = blockY(index);
      if (y < -80 || y > BOARD.height + 80) return;
      drawSprite(context, block.sprite, block.x, y - 12, block.width, 54, 1);
    });
  }

  function drawMovingBlock(context, now) {
    if (!state.moving) return;

    const moving = state.moving;
    const x = movingX(moving, now);
    const target = targetY();
    let y = target - BOARD.dropGap;

    if (moving.dropStartedAt) {
      const progress = Core.clamp(
        (now - moving.dropStartedAt) / BOARD.dropDuration,
        0,
        1,
      );
      const eased = 1 - Math.pow(1 - progress, 3);
      y += BOARD.dropGap * eased;
    }

    context.save();
    context.strokeStyle = "rgba(68, 246, 232, 0.18)";
    context.setLineDash([5, 8]);
    context.beginPath();
    context.moveTo(x + moving.width / 2, y + 38);
    context.lineTo(x + moving.width / 2, target + 50);
    context.stroke();
    context.restore();
    drawSprite(context, moving.sprite, x, y - 12, moving.width, 54, 1);
  }

  function drawFragments(context) {
    state.fragments.forEach(function (fragment) {
      context.save();
      context.translate(fragment.x + fragment.width / 2, fragment.y + fragment.height / 2);
      context.rotate(fragment.rotation);
      drawSprite(
        context,
        fragment.sprite || "fallingFragment",
        -fragment.width / 2,
        -fragment.height / 2,
        fragment.width,
        fragment.height,
        fragment.alpha,
      );
      context.restore();
    });
  }

  function drawEffects(context, now) {
    state.effects.forEach(function (effect) {
      const age = now - effect.createdAt;
      const progress = Core.clamp(age / effect.duration, 0, 1);
      const alpha = 1 - progress;

      if (effect.type === "sprite") {
        const size = effect.sprite === "feverLightning" ? 210 : 120 + progress * 38;
        drawSprite(
          context,
          effect.sprite,
          effect.x - size / 2,
          effect.y - size / 2,
          size,
          size,
          alpha,
        );
      } else {
        const seconds = age / 1000;
        const x = effect.x + effect.velocityX * seconds;
        const y = effect.y + effect.velocityY * seconds + 100 * seconds * seconds;
        context.save();
        context.globalAlpha = alpha;
        context.fillStyle = effect.color;
        context.fillRect(x, y, effect.size, effect.size);
        context.restore();
      }
    });
  }

  function drawScanlines(context, width, height) {
    context.save();
    context.globalAlpha = 0.075;
    context.fillStyle = "#000000";
    for (let y = 0; y < height; y += 4) {
      context.fillRect(0, y, width, 1);
    }
    context.restore();
  }

  function renderGame(now) {
    const context = dom.gameContext;
    context.clearRect(0, 0, BOARD.width, BOARD.height);
    drawBackdrop(context);

    const objectScale = getObjectScale();

    context.save();
    context.translate(BOARD.width / 2, BOARD.baseY);
    context.scale(objectScale, objectScale);
    context.translate(-BOARD.width / 2, -BOARD.baseY);
    drawTower(context);
    drawMovingBlock(context, now);
    drawFragments(context);
    drawEffects(context, now);
    context.restore();

    if (state.phase === "ending") {
      context.fillStyle = "rgba(255, 90, 111, 0.09)";
      context.fillRect(0, 0, BOARD.width, BOARD.height);
    }

    drawScanlines(context, BOARD.width, BOARD.height);
  }

  function pixelText(context, text, x, y, size, color, align, weight) {
    context.save();
    context.imageSmoothingEnabled = false;
    context.textAlign = align || "left";
    context.textBaseline = "alphabetic";
    context.font = `${weight || 800} ${size}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    context.fillStyle = color;
    context.fillText(text, x, y);
    context.restore();
  }

  function drawResultCity(context, seed) {
    let value = Math.max(1, seed || 1);
    function random() {
      value = (value * 9301 + 49297) % 233280;
      return value / 233280;
    }

    context.fillStyle = "#081239";
    for (let x = 0; x < 1200; ) {
      const width = 42 + Math.floor(random() * 62);
      const height = 70 + Math.floor(random() * 155);
      const top = 675 - height;
      context.fillRect(x, top, width, height);

      for (let wx = x + 10; wx < x + width - 7; wx += 18) {
        for (let wy = top + 16; wy < 650; wy += 22) {
          if (random() > 0.62) {
            context.fillStyle = random() > 0.5 ? COLORS.cyan : COLORS.magenta;
            context.globalAlpha = 0.55;
            context.fillRect(wx, wy, 5, 7);
            context.globalAlpha = 1;
            context.fillStyle = "#081239";
          }
        }
      }
      x += width + 7;
    }
  }

  function drawResultTower(context, x, baseY, floors) {
    const visibleFloors = Math.min(Math.max(8, floors), 15);
    const blockWidth = 112;
    const blockHeight = 18;
    const colors = [COLORS.cyan, COLORS.magenta, COLORS.amber];

    for (let index = 0; index < visibleFloors; index += 1) {
      const color = colors[index % colors.length];
      const y = baseY - index * blockHeight;
      context.fillStyle = COLORS.ink;
      context.fillRect(x - blockWidth / 2 - 4, y - 4, blockWidth + 8, blockHeight + 8);
      context.fillStyle = color;
      context.fillRect(x - blockWidth / 2, y, blockWidth, blockHeight);
      context.fillStyle = "rgba(255,255,255,0.7)";
      context.fillRect(x - blockWidth / 2 + 7, y + 3, blockWidth - 18, 3);
      context.fillStyle = "rgba(5,8,22,0.35)";
      context.fillRect(x - blockWidth / 2, y + blockHeight - 5, blockWidth, 5);
    }
  }

  function renderResultCard(result, best, isNewBest) {
    const context = dom.resultContext;
    const width = dom.resultCardCanvas.width;
    const height = dom.resultCardCanvas.height;
    const gradient = context.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, COLORS.navy);
    gradient.addColorStop(1, "#08143c");
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);
    drawResultCity(context, result.score + result.floors * 31);

    context.fillStyle = "rgba(5, 8, 22, 0.52)";
    context.fillRect(0, 0, width, height);
    context.strokeStyle = COLORS.cyan;
    context.lineWidth = 4;
    context.strokeRect(18, 18, width - 36, height - 36);
    context.strokeStyle = COLORS.magenta;
    context.beginPath();
    context.moveTo(width * 0.7, 18);
    context.lineTo(width - 18, 18);
    context.lineTo(width - 18, 160);
    context.stroke();

    pixelText(context, "STACK//99 · RUN RESULT", 54, 70, 34, COLORS.text, "left", 900);
    pixelText(context, result.nickname, width - 54, 68, 22, COLORS.cyan, "right", 800);

    if (isNewBest) {
      context.fillStyle = "rgba(255, 79, 216, 0.16)";
      context.fillRect(862, 88, 265, 52);
      context.strokeStyle = COLORS.magenta;
      context.lineWidth = 3;
      context.strokeRect(862, 88, 265, 52);
      pixelText(context, "NEW BEST", 994, 124, 26, COLORS.amber, "center", 900);
    }

    pixelText(context, "SCORE", 76, 193, 30, COLORS.text, "left", 800);
    pixelText(context, Core.formatScore(result.score), 76, 292, 100, COLORS.cyan, "left", 900);

    context.fillStyle = "rgba(7, 16, 46, 0.88)";
    context.fillRect(58, 334, 468, 248);
    context.strokeStyle = COLORS.cyan;
    context.lineWidth = 3;
    context.strokeRect(58, 334, 468, 248);
    pixelText(context, "THIS RUN", 292, 376, 24, COLORS.cyan, "center", 900);

    const metrics = [
      ["FLOOR", String(result.floors), COLORS.cyan],
      ["PERFECT", String(result.perfectCount), COLORS.magenta],
      ["MAX COMBO", String(result.maxCombo), COLORS.amber],
      ["ACCURACY", `${result.averageAccuracy.toFixed(1)}%`, COLORS.cyan],
      ["END", result.endReason === "time-up" ? "TIME UP" : "MISS", COLORS.danger],
    ];
    metrics.forEach(function (metric, index) {
      const y = 416 + index * 36;
      pixelText(context, metric[0], 88, y, 20, COLORS.text, "left", 700);
      pixelText(context, metric[1], 492, y, 22, metric[2], "right", 900);
    });

    context.fillStyle = "rgba(16, 28, 74, 0.86)";
    context.fillRect(708, 350, 426, 164);
    context.strokeStyle = COLORS.magenta;
    context.strokeRect(708, 350, 426, 164);
    pixelText(context, "PERSONAL BEST", 921, 390, 22, COLORS.magenta, "center", 900);
    pixelText(context, Core.formatScore(best.score), 921, 462, 54, COLORS.magenta, "center", 900);
    drawResultTower(context, 626, 595, result.floors);

    const finished = new Date(result.finishedAt);
    const dateLabel = new Intl.DateTimeFormat("ko-KR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(finished);
    pixelText(context, dateLabel, 1128, 622, 16, "rgba(234,251,255,0.72)", "right", 600);
    drawScanlines(context, width, height);

    dom.resultCardCanvas.setAttribute(
      "aria-label",
      `${result.nickname}의 결과. ${result.score}점, ${result.floors}층, PERFECT ${result.perfectCount}회`,
    );
  }

  function safeFilenamePart(value) {
    return Core.sanitizeNickname(value)
      .replace(/\s+/g, "-")
      .replace(/[^\p{L}\p{N}_-]/gu, "")
      .slice(0, 24) || "PLAYER";
  }

  function downloadResultCard() {
    if (!state.currentResult) return;

    const result = state.currentResult;
    const date = new Date(result.finishedAt);
    const stamp = [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, "0"),
      String(date.getDate()).padStart(2, "0"),
      "-",
      String(date.getHours()).padStart(2, "0"),
      String(date.getMinutes()).padStart(2, "0"),
      String(date.getSeconds()).padStart(2, "0"),
    ].join("");
    const filename = `STACK99_${safeFilenamePart(result.nickname)}_${result.score}_${stamp}.png`;

    dom.resultCardCanvas.toBlob(function (blob) {
      if (!blob) {
        announce("결과 카드 생성에 실패했습니다.");
        return;
      }

      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(function () {
        URL.revokeObjectURL(url);
      }, 1000);
      announce("PNG 결과 카드를 저장했습니다.");
    }, "image/png");
  }

  function retry() {
    resetRun();
    setScreen("game");
    announce("재도전을 시작합니다.");
    ensureLoop();
  }

  function changePlayer() {
    state.phase = "idle";
    setCountdownLabel("");
    setScreen("start");
    announce("닉네임을 입력하고 새 게임을 시작하세요.");
  }

  function bindEvents() {
    if (dom.startForm) {
      dom.startForm.addEventListener("submit", function (event) {
        event.preventDefault();
        startRun();
      });
    } else {
      dom.startButton.addEventListener("click", startRun);
    }

    dom.nicknameInput.addEventListener("input", function () {
      dom.nicknameInput.setCustomValidity("");
      if (dom.nicknameError) dom.nicknameError.textContent = "";
    });
    dom.muteButton.addEventListener("click", toggleMute);
    if (dom.startMuteButton) dom.startMuteButton.addEventListener("click", toggleMute);
    dom.downloadResult.addEventListener("click", downloadResultCard);
    dom.retryButton.addEventListener("click", retry);
    dom.changePlayer.addEventListener("click", changePlayer);
    dom.gameCanvas.addEventListener("pointerdown", function (event) {
      event.preventDefault();
      handlePlacementInput();
    });
    document.addEventListener("keydown", function (event) {
      if (event.code !== "Space") return;
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest(
          'button, input, select, textarea, a[href], [contenteditable="true"], [role="button"]',
        )
      ) {
        return;
      }
      if (state.screen === "game") event.preventDefault();
      if (!event.repeat) handlePlacementInput();
    });
  }

  async function boot() {
    queryDom();
    bindEvents();
    state.muted = readStorage(STORAGE.muted, "true") !== "false";
    updateMuteButton();
    dom.nicknameInput.value = readStorage(STORAGE.nickname, "NEON RUNNER");
    setScreen("start");

    const backgroundPromise = loadImage(
      assets.background,
      "concept-assets/01-night-city-background.png",
      function (ready) {
        assets.backgroundReady = ready;
      },
    );
    const spritesPromise = loadImage(
      assets.sprites,
      "concept-assets/02-object-icon-sheet-preview.png",
      function (ready) {
        assets.spritesReady = ready;
      },
    );

    await Promise.all([backgroundPromise, spritesPromise]);
    announce("STACK//99 준비가 완료되었습니다.");
  }

  window.Stack99Game = Object.freeze({
    getSnapshot: function () {
      return Object.freeze({
        screen: state.screen,
        phase: state.phase,
        score: state.score,
        floors: state.floors,
        combo: state.combo,
        feverCharge: state.feverCharge,
        perfectCount: state.perfectCount,
        muted: state.muted,
      });
    },
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
