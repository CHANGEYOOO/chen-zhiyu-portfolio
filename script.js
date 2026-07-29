document.documentElement.classList.add("has-js");

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
const videos = [...document.querySelectorAll("[data-autoplay-video]")];
const sequence = document.querySelector("[data-intro-sequence]");
const scenes = [...document.querySelectorAll(".scene-track[data-scene]")];
const copyStage = document.querySelector("[data-copy-stage]");
const copies = [...document.querySelectorAll("[data-copy]")];
const header = document.querySelector("[data-header]");
const works = document.querySelector("#work");
const worksToggle = document.querySelector("[data-works-toggle]");
const workPlayer = document.querySelector("[data-work-player]");
const workPlayerShell = workPlayer?.querySelector("[data-work-player-shell]");
const workPlayerVideo = workPlayer?.querySelector("[data-work-player-video]");
const workPlayerTitle = workPlayer?.querySelector("[data-work-player-title]");
const workPlayerStatus = workPlayer?.querySelector("[data-work-player-status]");
const workPlayerRetry = workPlayer?.querySelector("[data-work-player-retry]");
const contactCopyButton = document.querySelector("[data-contact-copy]");
const contactCopyLabel = contactCopyButton?.querySelector("[data-contact-copy-label]");
const contactFeedback = document.querySelector("#contact-feedback");

let introMetrics;
let animationFrameRequested = false;
let activeSceneIndex = -1;
let workPlayerOpen = false;
let workPlayerTrigger = null;
let workPlayerUrl = "";
const userPausedVideos = new WeakSet();

if (works && worksToggle) {
  const worksToggleLabel = worksToggle.querySelector("[data-works-toggle-label]");

  worksToggle.addEventListener("click", () => {
    const expanded = works.classList.toggle("is-expanded");
    worksToggle.setAttribute("aria-expanded", String(expanded));
    if (worksToggleLabel) worksToggleLabel.textContent = expanded ? "收起" : "查看更多";
  });
}

function dataSaverEnabled() {
  return Boolean(connection?.saveData);
}

function posterOnlyMode() {
  return reducedMotion.matches || dataSaverEnabled();
}

function prepareCharacters(copy) {
  const characters = [];

  copy.querySelectorAll("[data-reveal-text]").forEach((line) => {
    const text = line.textContent;
    const fragment = document.createDocumentFragment();

    [...text].forEach((character) => {
      const span = document.createElement("span");
      span.className = "char";
      span.textContent = character;
      span.setAttribute("aria-hidden", "true");
      fragment.appendChild(span);
      characters.push(span);
    });

    line.textContent = "";
    line.setAttribute("aria-label", text);
    line.appendChild(fragment);
  });

  return characters;
}

const copyCharacters = copies.map(prepareCharacters);

function setToggleState(video, button) {
  const playing = !video.paused && !video.ended;
  const visible = button.querySelector("[aria-hidden='true']");
  const label = button.querySelector(".sr-only");
  const context = video.closest(".hero") ? "首屏视频" : "第二段视频";

  visible.textContent = playing ? "Ⅱ" : "▶";
  label.textContent = `${playing ? "暂停" : "播放"}${context}`;
  button.setAttribute("aria-label", label.textContent);
}

function loadDeferredVideo(video) {
  let sourceChanged = false;

  video.querySelectorAll("source[data-src]").forEach((source) => {
    if (source.hasAttribute("src")) return;
    source.setAttribute("src", source.dataset.src);
    sourceChanged = true;
  });

  if (video.dataset.src && !video.hasAttribute("src")) {
    video.setAttribute("src", video.dataset.src);
    sourceChanged = true;
  }

  if (sourceChanged) video.load();
}

function unloadVideo(video) {
  video.pause();
  video.removeAttribute("src");
  video.querySelectorAll("source[src]").forEach((source) => source.removeAttribute("src"));
  video.closest(".media-panel")?.classList.remove("has-video-frame");
  video.load();
}

function showAutoplayNote(video, visible) {
  const note = video.closest(".media-panel")?.querySelector("[data-autoplay-note]");
  if (note) note.hidden = !visible;
}

function pauseOtherVideos(activeVideo) {
  videos.forEach((video) => {
    if (video !== activeVideo && !video.paused) video.pause();
  });
}

function tryPlay(video) {
  if (
    workPlayerOpen ||
    posterOnlyMode() ||
    userPausedVideos.has(video) ||
    !video.paused
  ) {
    return;
  }

  pauseOtherVideos(video);
  const result = video.play();
  if (result) {
    result.catch(() => {
      showAutoplayNote(video, true);
      const button = video.closest(".media-panel")?.querySelector("[data-video-toggle]");
      if (button) setToggleState(video, button);
    });
  }
}

function setWorkPlayerStatus(message = "") {
  if (!workPlayerStatus) return;
  workPlayerStatus.textContent = message;
  workPlayerStatus.hidden = !message;
}

function unloadWorkPlayer() {
  if (!workPlayerVideo) return;
  workPlayerVideo.pause();
  workPlayerVideo.removeAttribute("src");
  workPlayerVideo.removeAttribute("poster");
  workPlayerVideo.load();
  workPlayerUrl = "";
}

function closeWorkPlayer({ restoreFocus = true } = {}) {
  if (!workPlayerOpen || !workPlayer) return;

  workPlayerOpen = false;
  document.body.classList.remove("work-player-open");
  unloadWorkPlayer();
  setWorkPlayerStatus("");
  if (workPlayerRetry) workPlayerRetry.hidden = true;

  if (document.fullscreenElement) {
    document.exitFullscreen?.().catch(() => {});
  }

  if (workPlayer.open) workPlayer.close();
  if (restoreFocus) workPlayerTrigger?.focus({ preventScroll: true });
  workPlayerTrigger = null;
}

function playSelectedWork() {
  if (!workPlayerVideo || !workPlayerUrl) return;

  setWorkPlayerStatus("正在载入视频…");
  if (workPlayerRetry) workPlayerRetry.hidden = true;
  workPlayerVideo.src = workPlayerUrl;
  workPlayerVideo.load();
  const playResult = workPlayerVideo.play();
  playResult?.catch(() => {
    if (workPlayerVideo.error) return;
    setWorkPlayerStatus("视频已载入，请点击播放按钮开始播放。");
  });
}

function openWorkPlayer(card, trigger) {
  if (!workPlayer || !workPlayerVideo || !works) return;

  const slug = card.dataset.work;
  const base = works.dataset.videoBase;
  const title = card.querySelector("h3")?.textContent?.trim() || "作品播放";
  const poster = card.querySelector(".work-poster img");
  if (!slug || !base) return;

  workPlayerTrigger = trigger;
  workPlayerOpen = true;
  workPlayerUrl = `${new URL(`${slug}.mp4`, base).href}?v=0.12`;
  workPlayerTitle.textContent = title;
  workPlayerVideo.poster = poster?.currentSrc || poster?.src || "";
  document.body.classList.add("work-player-open");
  videos.forEach((video) => video.pause());

  if (typeof workPlayer.showModal === "function") {
    workPlayer.showModal();
  } else {
    workPlayer.setAttribute("open", "");
  }

  const fullscreenResult = workPlayerShell?.requestFullscreen?.({ navigationUI: "hide" });
  fullscreenResult?.catch(() => {});
  playSelectedWork();
}

if (works && workPlayer && workPlayerVideo) {
  works.querySelectorAll(".work-card[data-work]").forEach((card) => {
    const title = card.querySelector("h3")?.textContent?.trim() || "作品";
    const playButton = document.createElement("button");
    playButton.className = "work-play";
    playButton.type = "button";
    playButton.setAttribute("aria-label", `全屏播放：${title}`);
    playButton.innerHTML = '<span class="work-play-icon" aria-hidden="true">▶</span>';
    playButton.addEventListener("click", () => openWorkPlayer(card, playButton));
    card.appendChild(playButton);
  });

  workPlayer.querySelector("[data-work-player-close]")?.addEventListener("click", () => {
    closeWorkPlayer();
  });

  workPlayer.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeWorkPlayer();
  });

  workPlayer.addEventListener("click", (event) => {
    if (event.target === workPlayer) closeWorkPlayer();
  });

  workPlayerRetry?.addEventListener("click", playSelectedWork);

  workPlayerVideo.addEventListener("playing", () => {
    setWorkPlayerStatus("");
    if (workPlayerRetry) workPlayerRetry.hidden = true;
  });

  workPlayerVideo.addEventListener("waiting", () => {
    if (workPlayerVideo.error) return;
    setWorkPlayerStatus("正在缓冲视频…");
  });

  workPlayerVideo.addEventListener("error", () => {
    setWorkPlayerStatus("视频加载失败，请检查网络后重试。");
    if (workPlayerRetry) workPlayerRetry.hidden = false;
  });

  workPlayerVideo.addEventListener("webkitendfullscreen", () => closeWorkPlayer());

  document.addEventListener("fullscreenchange", () => {
    if (workPlayerOpen && !document.fullscreenElement && workPlayer.open) {
      closeWorkPlayer();
    }
  });

  window.addEventListener("pagehide", () => closeWorkPlayer({ restoreFocus: false }));
}

if (contactCopyButton && contactCopyLabel && contactFeedback) {
  let copyResetTimer;

  async function copyContactValue(value) {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return;
    }

    const helper = document.createElement("textarea");
    helper.value = value;
    helper.setAttribute("readonly", "");
    helper.style.position = "fixed";
    helper.style.opacity = "0";
    document.body.appendChild(helper);
    helper.select();
    const copied = document.execCommand("copy");
    helper.remove();
    if (!copied) throw new Error("Copy failed");
  }

  contactCopyButton.addEventListener("click", async () => {
    const value = contactCopyButton.dataset.copyValue;
    if (!value) return;

    try {
      await copyContactValue(value);
      contactCopyLabel.textContent = "Copied ✓";
      contactFeedback.textContent = "微信号已复制：18969534061";
      window.clearTimeout(copyResetTimer);
      copyResetTimer = window.setTimeout(() => {
        contactCopyLabel.textContent = "Copy";
        contactFeedback.textContent = "微信号与手机号码相同，点击可复制。";
      }, 2400);
    } catch {
      contactFeedback.textContent = "复制失败，请长按号码手动复制。";
    }
  });
}

document.querySelectorAll("[data-video-toggle]").forEach((button) => {
  const panel = button.closest(".media-panel");
  const video = panel.querySelector("video");

  button.addEventListener("click", () => {
    if (posterOnlyMode()) return;

    loadDeferredVideo(video);
    if (video.paused) {
      userPausedVideos.delete(video);
      video.muted = true;
      video.playsInline = true;
      pauseOtherVideos(video);
      const result = video.play();
      if (result) result.catch(() => showAutoplayNote(video, true));
    } else {
      userPausedVideos.add(video);
      video.pause();
    }
  });

  video.addEventListener("play", () => {
    pauseOtherVideos(video);
    showAutoplayNote(video, false);
    setToggleState(video, button);
  });
  video.addEventListener("playing", () => panel.classList.add("has-video-frame"));
  video.addEventListener("pause", () => setToggleState(video, button));
  video.addEventListener("emptied", () => panel.classList.remove("has-video-frame"));
  video.addEventListener("error", () => {
    panel.classList.remove("has-video-frame");
    showAutoplayNote(video, true);
  });
  setToggleState(video, button);
});

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function smoothstep(start, end, value) {
  const progress = clamp((value - start) / (end - start), 0, 1);
  return progress * progress * (3 - 2 * progress);
}

function revealCharacters(characters, progress) {
  const total = Math.max(characters.length - 1, 1);

  characters.forEach((character, index) => {
    const start = (index / total) * 0.86;
    const opacity = reducedMotion.matches ? 1 : smoothstep(start, start + 0.14, progress);
    character.style.setProperty("--char-opacity", String(opacity));
  });
}

function setActiveScene(index) {
  const nextIndex = Number.isInteger(index) ? index : -1;

  if (activeSceneIndex !== nextIndex) {
    activeSceneIndex = nextIndex;

    scenes.forEach((scene, sceneIndex) => {
      const panel = scene.querySelector(".media-panel");
      const video = scene.querySelector("video");
      const button = scene.querySelector("[data-video-toggle]");
      const isActive = sceneIndex === activeSceneIndex;

      panel?.classList.toggle("is-active", isActive);
      if (button) button.tabIndex = isActive ? 0 : -1;
      if (!isActive && video && !video.paused) video.pause();
    });
  }

  const activeVideo = scenes[activeSceneIndex]?.querySelector("video");
  if (activeVideo && !posterOnlyMode()) {
    loadDeferredVideo(activeVideo);
    tryPlay(activeVideo);
  }
}

function measureIntroSequence() {
  if (!sequence || scenes.length < 2) return;

  const firstTrack = scenes[0];
  const secondTrack = scenes[1];
  const viewportHeight = firstTrack.querySelector(".media-panel")?.offsetHeight || window.innerHeight;

  introMetrics = {
    viewportHeight,
    sequenceHeight: sequence.offsetHeight,
    firstHoldEnd: Math.max(firstTrack.offsetHeight - viewportHeight, 1),
    firstExitEnd: firstTrack.offsetTop + firstTrack.offsetHeight,
    secondHoldEnd:
      secondTrack.offsetTop + Math.max(secondTrack.offsetHeight - viewportHeight, 1),
  };
}

function updateIntroSequence() {
  if (!sequence || !introMetrics) return;

  const rect = sequence.getBoundingClientRect();
  const distance = clamp(-rect.top, 0, introMetrics.sequenceHeight);
  const transitionFadeEnd = Math.min(
    introMetrics.firstExitEnd,
    introMetrics.firstHoldEnd + introMetrics.viewportHeight * 0.42,
  );
  const firstCopyOpacity = reducedMotion.matches
    ? Number(distance < introMetrics.firstExitEnd)
    : 1 - smoothstep(introMetrics.firstHoldEnd, transitionFadeEnd, distance);
  const secondCopyEntranceOpacity = reducedMotion.matches
    ? Number(distance >= introMetrics.firstExitEnd)
    : smoothstep(
        introMetrics.firstExitEnd,
        introMetrics.firstExitEnd + introMetrics.viewportHeight * 0.12,
        distance,
      );
  const secondCopyExitOpacity = reducedMotion.matches
    ? Number(distance < introMetrics.secondHoldEnd)
    : 1 -
      smoothstep(
        introMetrics.secondHoldEnd,
        introMetrics.secondHoldEnd + introMetrics.viewportHeight * 0.08,
        distance,
      );
  const secondCopyOpacity = secondCopyEntranceOpacity * secondCopyExitOpacity;
  const sequenceVisible = rect.bottom > 0 && rect.top < window.innerHeight;
  const firstReveal = clamp(distance / introMetrics.firstHoldEnd, 0, 1);
  const secondReveal = clamp(
    (distance - introMetrics.firstExitEnd) /
      (introMetrics.secondHoldEnd - introMetrics.firstExitEnd),
    0,
    1,
  );

  const secondVideo = scenes[1]?.querySelector("video");
  const secondLoadStart = Math.max(
    introMetrics.firstExitEnd - introMetrics.viewportHeight * 0.1,
    0,
  );

  if (
    secondVideo &&
    distance >= secondLoadStart &&
    !dataSaverEnabled() &&
    !reducedMotion.matches
  ) {
    loadDeferredVideo(secondVideo);
  }

  const nextActiveScene = sequenceVisible
    ? distance < introMetrics.firstExitEnd
      ? 0
      : 1
    : -1;
  setActiveScene(nextActiveScene);

  copyStage.style.setProperty("--copy-one-opacity", String(firstCopyOpacity));
  copyStage.style.setProperty("--copy-two-opacity", String(secondCopyOpacity));
  copyStage.style.setProperty("--copy-stage-opacity", sequenceVisible ? "1" : "0");
  copyStage.style.setProperty("--copy-stage-visibility", sequenceVisible ? "visible" : "hidden");

  revealCharacters(copyCharacters[0], firstReveal);
  revealCharacters(copyCharacters[1], secondReveal);
}

function updateFrame() {
  animationFrameRequested = false;
  header?.classList.toggle("is-scrolled", window.scrollY > 24);
  updateIntroSequence();
}

function requestFrameUpdate() {
  if (animationFrameRequested) return;
  animationFrameRequested = true;
  window.requestAnimationFrame(updateFrame);
}

function applyMotionPreference() {
  const posterOnly = posterOnlyMode();
  document.documentElement.classList.toggle("poster-only", posterOnly);

  document.querySelectorAll("[data-video-toggle]").forEach((button) => {
    button.disabled = posterOnly;
  });

  if (posterOnly) {
    videos.forEach(unloadVideo);
    videos.forEach((video) => showAutoplayNote(video, false));
  } else {
    const activeVideo = scenes[activeSceneIndex]?.querySelector("video");
    if (activeVideo) {
      loadDeferredVideo(activeVideo);
      tryPlay(activeVideo);
    }
  }

  requestFrameUpdate();
}

reducedMotion.addEventListener("change", applyMotionPreference);
connection?.addEventListener?.("change", applyMotionPreference);
applyMotionPreference();

window.addEventListener("scroll", requestFrameUpdate, { passive: true });

window.addEventListener("resize", () => {
  measureIntroSequence();
  requestFrameUpdate();
});

window.addEventListener("orientationchange", () => {
  measureIntroSequence();
  requestFrameUpdate();
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    videos.forEach((video) => video.pause());
  } else {
    applyMotionPreference();
  }
});

measureIntroSequence();
requestFrameUpdate();

window.addEventListener("load", () => {
  measureIntroSequence();
  requestFrameUpdate();
});
