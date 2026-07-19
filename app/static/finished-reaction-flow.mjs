export function createFinishedReactionFlow(options) {
  const {
    querySelector,
    playReaction,
    scheduleTimeout = globalThis.setTimeout.bind(globalThis),
    cancelTimeout = globalThis.clearTimeout.bind(globalThis),
  } = options;
  const scheduleFrame = options.scheduleFrame
    ?? globalThis.requestAnimationFrame?.bind(globalThis)
    ?? ((callback) => scheduleTimeout(callback, 16));
  const cancelFrame = options.cancelFrame
    ?? globalThis.cancelAnimationFrame?.bind(globalThis)
    ?? cancelTimeout;

  let currentOutcomeKey = null;
  let playback = null;
  let revealHandle = null;
  let firstResultFrame = null;
  let secondResultFrame = null;
  let resultFrameGeneration = 0;

  function stageElement() {
    return querySelector("[data-character-reaction]");
  }

  function cancelResultFrames() {
    resultFrameGeneration += 1;
    if (firstResultFrame !== null) cancelFrame(firstResultFrame);
    if (secondResultFrame !== null) cancelFrame(secondResultFrame);
    firstResultFrame = null;
    secondResultFrame = null;
  }

  function setResultVisibility(visible) {
    cancelResultFrames();
    const card = querySelector("#result-card");
    if (!card) return;

    card.hidden = !visible;
    card.setAttribute("aria-hidden", visible ? "false" : "true");
    if (visible) {
      card.removeAttribute("inert");
      card.classList.remove("result-card--visible");
      const generation = resultFrameGeneration;
      firstResultFrame = scheduleFrame(() => {
        firstResultFrame = null;
        if (generation !== resultFrameGeneration) return;
        secondResultFrame = scheduleFrame(() => {
          secondResultFrame = null;
          if (generation !== resultFrameGeneration) return;
          card.classList.add("result-card--visible");
        });
      });
    } else {
      card.setAttribute("inert", "");
      card.classList.remove("result-card--visible");
    }
  }

  function setStageVisibility(visible) {
    const container = stageElement()?.closest(".reaction-stage");
    if (!container) return;

    container.setAttribute("aria-hidden", visible ? "false" : "true");
    if (visible) {
      container.removeAttribute("inert");
      container.classList.remove("reaction-stage--hidden");
    } else {
      container.setAttribute("inert", "");
      container.classList.add("reaction-stage--hidden");
    }
  }

  function cancelPlayback() {
    playback?.cancel();
    playback = null;
    if (revealHandle !== null) cancelTimeout(revealHandle);
    revealHandle = null;
    cancelResultFrames();
  }

  function showReplayAndResult(immediate = false) {
    setStageVisibility(false);
    const replay = querySelector("#deployment-replay");
    replay?.classList.add("deployment-replay--active");

    if (revealHandle !== null) cancelTimeout(revealHandle);
    revealHandle = null;
    if (immediate || !replay) {
      setResultVisibility(true);
      return;
    }

    setResultVisibility(false);
    let handle;
    handle = scheduleTimeout(() => {
      if (revealHandle !== handle) return;
      revealHandle = null;
      setResultVisibility(true);
    }, 1900);
    revealHandle = handle;
  }

  function startPlayback(sauces, replay) {
    const stage = stageElement();
    if (!sauces.length || !replay || !stage) {
      setResultVisibility(true);
      return false;
    }

    setResultVisibility(false);
    playback = playReaction(stage, sauces, {
      onPhase: () => {},
      onComplete: () => {
        playback = null;
        showReplayAndResult(false);
      },
    });
    return true;
  }

  return {
    isCurrentOutcome(outcomeKey) {
      return currentOutcomeKey === outcomeKey;
    },

    beginOutcome(outcomeKey, sauces, replay) {
      cancelPlayback();
      currentOutcomeKey = outcomeKey;
      return startPlayback(sauces, replay);
    },

    cancelPlayback,
    showReplayAndResult,

    skip() {
      cancelPlayback();
      showReplayAndResult(true);
    },

    replay(sauces, replay) {
      const stage = stageElement();
      if (!stage || !replay) return false;

      cancelPlayback();
      querySelector("#deployment-replay")?.classList.remove("deployment-replay--active");
      setResultVisibility(false);
      setStageVisibility(true);
      stage.dataset.phase = "notice";
      stage.dataset.foodBitten = "false";
      const started = startPlayback(sauces, replay);
      if (started) stage.scrollIntoView({ behavior: "smooth", block: "center" });
      return started;
    },

    leaveRoute() {
      cancelPlayback();
      currentOutcomeKey = null;
    },
  };
}
