document.documentElement.classList.add("has-js");

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const videos = [...document.querySelectorAll("[data-autoplay-video]")];
const sequence = document.querySelector("[data-intro-sequence]");
const scenes = [...document.querySelectorAll(".scene-track[data-scene]")];
const copyStage = document.querySelector("[data-copy-stage]");
const copies = [...document.querySelectorAll("[data-copy]")];

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
  if (!video.dataset.src || video.src) return;
  video.src = video.dataset.src;
  video.load();
}

function tryPlay(video) {
  if (reducedMotion.matches) return;

  const result = video.play();
  if (result) {
    result.catch(() => {
      const note = video.closest(".media-panel")?.querySelector("[data-autoplay-note]");
      if (note) note.hidden = false;
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
      video.play();
    } else {
      video.pause();
    }
  });

  video.addEventListener("play", () => setToggleState(video, button));
  video.addEventListener("pause", () => setToggleState(video, button));
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

function updateIntroSequence() {
  if (!sequence) return;

  const rect = sequence.getBoundingClientRect();
  const distance = clamp(-rect.top, 0, sequence.offsetHeight);
  const firstTrack = scenes[0];
  const secondTrack = scenes[1];
  const firstHoldEnd = Math.max(firstTrack.offsetHeight - window.innerHeight, 1);
  const secondStart = secondTrack.offsetTop;
  const secondHoldEnd = secondStart + Math.max(secondTrack.offsetHeight - window.innerHeight, 1);
  const transitionFadeEnd = firstHoldEnd + window.innerHeight * 0.42;
  const firstCopyOpacity = reducedMotion.matches
    ? Number(distance < secondStart)
    : 1 - smoothstep(firstHoldEnd, transitionFadeEnd, distance);
  const secondCopyOpacity = reducedMotion.matches
    ? Number(distance >= secondStart)
    : smoothstep(secondStart, secondStart + window.innerHeight * 0.12, distance);
  const secondIsActive = distance >= secondStart;
  const sequenceVisible = rect.bottom > 0 && rect.top < window.innerHeight;
  const firstReveal = clamp(distance / firstHoldEnd, 0, 1);
  const secondReveal = clamp((distance - secondStart) / (secondHoldEnd - secondStart), 0, 1);

  copyStage.style.setProperty("--copy-one-opacity", String(firstCopyOpacity));
  copyStage.style.setProperty("--copy-two-opacity", String(secondCopyOpacity));
  copyStage.style.setProperty("--copy-stage-opacity", sequenceVisible ? "1" : "0");
  copyStage.style.setProperty("--copy-stage-visibility", sequenceVisible ? "visible" : "hidden");

  copies.forEach((copy, index) => {
    const active = index === Number(secondIsActive);
    copy.setAttribute("aria-hidden", String(!active || !sequenceVisible));
  });

  revealCharacters(copyCharacters[0], firstReveal);
  revealCharacters(copyCharacters[1], secondReveal);
}

const mediaObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      const video = entry.target.querySelector("video");
      if (!video) return;

      if (entry.isIntersecting) {
        loadDeferredVideo(video);
        tryPlay(video);
      } else {
        video.pause();
      }
    });
  },
  { rootMargin: "20% 0px 20% 0px", threshold: 0.05 },
);

scenes.forEach((scene) => mediaObserver.observe(scene));

function applyMotionPreference() {
  if (reducedMotion.matches) {
    videos.forEach((video) => video.pause());
  } else {
    updateIntroSequence();
  }
}

reducedMotion.addEventListener("change", applyMotionPreference);
applyMotionPreference();

const header = document.querySelector("[data-header]");
window.addEventListener(
  "scroll",
  () => {
    header.classList.toggle("is-scrolled", window.scrollY > 24);
    updateIntroSequence();
  },
  { passive: true },
);

window.addEventListener("resize", updateIntroSequence);
updateIntroSequence();
