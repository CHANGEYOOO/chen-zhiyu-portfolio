document.documentElement.classList.add("has-js");

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
const videos = [...document.querySelectorAll("[data-autoplay-video]")];
const sequence = document.querySelector("[data-intro-sequence]");
const scenes = [...document.querySelectorAll(".scene-track[data-scene]")];
const copyStage = document.querySelector("[data-copy-stage]");
const copies = [...document.querySelectorAll("[data-copy]")];
const header = document.querySelector("[data-header]");

let introMetrics;
let animationFrameRequested = false;
let activeSceneIndex = -1;
const userPausedVideos = new WeakSet();

function dataSaverEnabled() {
  return Boolean(connection?.saveData);
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

function hasLoadedSource(video) {
  return (
    video.hasAttribute("src") ||
    [...video.querySelectorAll("source")].some((source) => source.hasAttribute("src"))
  );
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
    reducedMotion.matches ||
    dataSaverEnabled() ||
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

document.querySelectorAll("[data-video-toggle]").forEach((button) => {
  const panel = button.closest(".media-panel");
  const video = panel.querySelector("video");

  button.addEventListener("click", () => {
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
  video.addEventListener("pause", () => setToggleState(video, button));
  video.addEventListener("error", () => showAutoplayNote(video, true));
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
  if (activeVideo && hasLoadedSource(activeVideo)) tryPlay(activeVideo);
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
  const secondCopyOpacity = reducedMotion.matches
    ? Number(distance >= introMetrics.firstExitEnd)
    : smoothstep(
        introMetrics.firstExitEnd,
        introMetrics.firstExitEnd + introMetrics.viewportHeight * 0.12,
        distance,
      );
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
  if (reducedMotion.matches || dataSaverEnabled()) {
    videos.forEach((video) => video.pause());
    videos.forEach((video) => showAutoplayNote(video, true));
  } else {
    const activeVideo = scenes[activeSceneIndex]?.querySelector("video");
    if (activeVideo && hasLoadedSource(activeVideo)) tryPlay(activeVideo);
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
