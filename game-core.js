(function (root, factory) {
  const api = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  root.Stack99Core = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const CONFIG = Object.freeze({
    BASE_SCORE: 1000,
    ACCURACY_BONUS_MAX: 200,
    PERFECT_BONUS_STEP: 100,
    PERFECT_COMBO_CAP: 3,
    PERFECT_THRESHOLD: 3,
    FEVER_DURATION_MS: 5000,
    ROUND_DURATION_MS: 60000,
    START_SPEED: 230,
    SPEED_STEP_FLOORS: 2,
    SPEED_STEP: 45,
    MAX_SPEED: 680,
  });

  function toFiniteNumber(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function clamp(value, min, max) {
    const lower = Math.min(min, max);
    const upper = Math.max(min, max);
    return Math.min(Math.max(toFiniteNumber(value, lower), lower), upper);
  }

  function getSpeed(floors) {
    const placedFloors = Math.max(0, Math.floor(toFiniteNumber(floors, 0)));
    const speedSteps = Math.floor(placedFloors / CONFIG.SPEED_STEP_FLOORS);

    return Math.min(
      CONFIG.START_SPEED + speedSteps * CONFIG.SPEED_STEP,
      CONFIG.MAX_SPEED,
    );
  }

  function normalizeBlock(block) {
    const x = toFiniteNumber(block && block.x, 0);
    const width = Math.max(0, toFiniteNumber(block && block.width, 0));
    return { x, width, right: x + width };
  }

  function getSpawnMotion(baseBlock, playLeft, playRight, random = Math.random) {
    const base = normalizeBlock(baseBlock);
    const left = toFiniteNumber(playLeft, 0);
    const right = Math.max(left, toFiniteNumber(playRight, left) - base.width);
    const approach = Math.min(180, (right - left) / 2);
    const leftEnd = Math.min(right, base.x - approach);
    const rightStart = Math.max(left, base.x + approach);
    const canStartLeft = leftEnd >= left;
    const canStartRight = rightStart <= right;
    const pick = () => clamp(random(), 0, 1);

    // 타워에서 최소 접근 거리를 확보할 수 있는 쪽과 그 안의 출발점을 추첨한다.
    // 같은 방향이 연속으로 나올 수 있으며 층수의 홀짝과는 무관하다.
    const fromRight = canStartLeft && canStartRight ? pick() >= 0.5
      : canStartRight || (!canStartLeft && right - base.x > base.x - left);
    const start = fromRight ? Math.min(right, rightStart) : left;
    const end = fromRight ? right : Math.max(left, leftEnd);
    return { x: start + (end - start) * pick(), fromRight };
  }

  function calculateOverlap(baseBlock, movingBlock) {
    const base = normalizeBlock(baseBlock);
    const moving = normalizeBlock(movingBlock);
    const left = Math.max(base.x, moving.x);
    const right = Math.min(base.right, moving.right);
    const width = Math.max(0, right - left);

    return {
      left,
      right: Math.max(left, right),
      width,
      ratio: moving.width > 0 ? clamp(width / moving.width, 0, 1) : 0,
    };
  }

  function resolvePlacement(baseBlock, movingBlock) {
    const base = normalizeBlock(baseBlock);
    const moving = normalizeBlock(movingBlock);
    const overlap = calculateOverlap(base, moving);

    if (overlap.width <= 0 || moving.width <= 0 || base.width <= 0) {
      return {
        miss: true,
        perfect: false,
        x: moving.x,
        width: 0,
        ratio: 0,
        fragment: null,
      };
    }

    const isPerfect = Math.abs(moving.x - base.x) <= CONFIG.PERFECT_THRESHOLD;

    if (isPerfect) {
      return {
        miss: false,
        perfect: true,
        x: base.x,
        width: base.width,
        ratio: 1,
        fragment: null,
      };
    }

    let fragment = null;
    if (moving.x < base.x) {
      fragment = {
        side: "left",
        x: moving.x,
        width: Math.max(0, overlap.left - moving.x),
      };
    } else if (moving.right > base.right) {
      fragment = {
        side: "right",
        x: overlap.right,
        width: Math.max(0, moving.right - overlap.right),
      };
    }

    if (fragment && fragment.width <= 0) {
      fragment = null;
    }

    return {
      miss: false,
      perfect: false,
      x: overlap.left,
      width: overlap.width,
      ratio: overlap.ratio,
      fragment,
    };
  }

  function calculateLayerScore(ratio, perfect, combo, feverActive) {
    const safeRatio = clamp(ratio, 0, 1);
    const safeCombo = Math.max(0, Math.floor(toFiniteNumber(combo, 0)));
    const multiplier = feverActive ? 2 : 1;
    const accuracyBonus = Math.round(
      safeRatio * CONFIG.ACCURACY_BONUS_MAX * multiplier,
    );
    const perfectBonus = perfect
      ? Math.min(safeCombo, CONFIG.PERFECT_COMBO_CAP) *
        CONFIG.PERFECT_BONUS_STEP *
        multiplier
      : 0;

    return CONFIG.BASE_SCORE + accuracyBonus + perfectBonus;
  }

  function formatScore(score) {
    const safeScore = Math.max(0, Math.floor(toFiniteNumber(score, 0)));
    return String(safeScore).padStart(6, "0");
  }

  function formatTime(milliseconds) {
    const safeMilliseconds = clamp(
      milliseconds,
      0,
      CONFIG.ROUND_DURATION_MS,
    );
    const totalSeconds = Math.ceil(safeMilliseconds / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;

    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  function normalizeNickname(nickname) {
    return String(nickname == null ? "" : nickname)
      .normalize("NFC")
      .replace(/\s+/g, " ")
      .trim();
  }

  function isValidNickname(nickname) {
    return /^[\p{Script=Hangul}A-Za-z0-9 ]{2,12}$/u.test(
      normalizeNickname(nickname),
    );
  }

  function sanitizeNickname(nickname) {
    const cleaned = Array.from(
      normalizeNickname(nickname).replace(
        /[^\p{Script=Hangul}A-Za-z0-9 ]/gu,
        "",
      ),
    )
      .slice(0, 12)
      .join("")
      .replace(/\s+/g, " ")
      .trim();

    return isValidNickname(cleaned) ? cleaned : "PLAYER";
  }

  function getDueRunEvent(deadlineAt, settleAt, now) {
    const safeNow = toFiniteNumber(now, 0);
    const safeDeadline = toFiniteNumber(deadlineAt, Infinity);
    const hasSettleEvent =
      settleAt !== null &&
      settleAt !== undefined &&
      Number.isFinite(Number(settleAt));
    const safeSettle = hasSettleEvent ? Number(settleAt) : Infinity;

    if (safeSettle <= safeNow && safeSettle <= safeDeadline) {
      return "settle";
    }

    if (safeDeadline <= safeNow) {
      return "deadline";
    }

    return null;
  }

  function advanceFeverCharge(currentCharge, perfect, feverActive) {
    if (!perfect) {
      return { charge: 0, triggered: false };
    }

    if (feverActive) {
      return { charge: 0, triggered: false };
    }

    const nextCharge =
      Math.max(0, Math.floor(toFiniteNumber(currentCharge, 0))) + 1;
    if (nextCharge >= CONFIG.PERFECT_COMBO_CAP) {
      return { charge: 0, triggered: true };
    }

    return { charge: nextCharge, triggered: false };
  }

  function getObjectScale(
    clientWidth,
    clientHeight,
    boardWidth,
    boardHeight,
    playWidth,
    safeWidthRatio,
  ) {
    const safeClientWidth = Math.max(1, toFiniteNumber(clientWidth, boardWidth));
    const safeClientHeight = Math.max(
      1,
      toFiniteNumber(clientHeight, boardHeight),
    );
    const safeBoardWidth = Math.max(1, toFiniteNumber(boardWidth, 1));
    const safeBoardHeight = Math.max(1, toFiniteNumber(boardHeight, 1));
    const safePlayWidth = Math.max(1, toFiniteNumber(playWidth, 1));
    const widthRatio = clamp(safeWidthRatio, 0.1, 1);
    const coverScale = Math.max(
      safeClientWidth / safeBoardWidth,
      safeClientHeight / safeBoardHeight,
    );
    const visibleLogicalWidth = safeClientWidth / coverScale;

    return Math.min(1, (visibleLogicalWidth * widthRatio) / safePlayWidth);
  }

  function createRunResult(run) {
    const source = run || {};
    const finishedAt = source.finishedAt
      ? new Date(source.finishedAt)
      : new Date();
    const validDate = Number.isNaN(finishedAt.getTime()) ? new Date() : finishedAt;

    return Object.freeze({
      nickname: sanitizeNickname(source.nickname),
      score: Math.max(0, Math.floor(toFiniteNumber(source.score, 0))),
      floors: Math.max(0, Math.floor(toFiniteNumber(source.floors, 0))),
      perfectCount: Math.max(
        0,
        Math.floor(toFiniteNumber(source.perfectCount, 0)),
      ),
      maxCombo: Math.max(0, Math.floor(toFiniteNumber(source.maxCombo, 0))),
      averageAccuracy: clamp(source.averageAccuracy, 0, 100),
      endReason: source.endReason === "time-up" ? "time-up" : "miss",
      elapsedMs: clamp(source.elapsedMs, 0, CONFIG.ROUND_DURATION_MS),
      finishedAt: validDate.toISOString(),
    });
  }

  return Object.freeze({
    CONFIG,
    clamp,
    getSpeed,
    getSpawnMotion,
    calculateOverlap,
    resolvePlacement,
    calculateLayerScore,
    formatScore,
    formatTime,
    normalizeNickname,
    isValidNickname,
    sanitizeNickname,
    getDueRunEvent,
    advanceFeverCharge,
    getObjectScale,
    createRunResult,
  });
});
