document.documentElement.classList.add("has-js");

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
const videos = [...document.querySelectorAll("[data-autoplay-video]")];
const sequence = document.querySelector("[data-intro-sequence]");
const scenes = [...document.querySelectorAll(".scene-track[data-scene]")];
const copyStage = document.querySelector("[data-copy-stage]");
const copies = [...document.querySelectorAll("[data-copy]")];
const header = document.querySelector("[data-header]");
const scrollSentinel = document.querySelector(".scroll-sentinel");
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
const contact = document.querySelector("#contact");
const about = document.querySelector("[data-about]");
const livestream = document.querySelector("[data-livestream]");
const livestreamProjects = livestream?.querySelector("[data-livestream-projects]");
const livestreamActions = livestream?.querySelector("[data-livestream-actions]");
const livestreamToggle = livestream?.querySelector("[data-livestream-toggle]");
const precisePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
const siteLoader = document.querySelector("[data-site-loader]");
const siteLoaderTrack = siteLoader?.querySelector("[data-loader-track]");
const siteLoaderFill = siteLoader?.querySelector("[data-loader-fill]");
const siteLoaderPercent = siteLoader?.querySelector("[data-loader-percent]");

let introMetrics;
let animationFrameRequested = false;
let sequenceInView = true;
let activeSceneIndex = -1;
let workPlayerOpen = false;
let workPlayerTrigger = null;
let workPlayerUrl = "";
let siteLoaderReady = false;
let tvcHydrationCancelled = false;
let livestreamHydrationCancelled = false;
const userPausedVideos = new WeakSet();

if (works && worksToggle) {
  const worksToggleLabel = worksToggle.querySelector("[data-works-toggle-label]");

  worksToggle.addEventListener("click", () => {
    const expanded = works.classList.toggle("is-expanded");
    worksToggle.setAttribute("aria-expanded", String(expanded));
    if (worksToggleLabel) worksToggleLabel.textContent = expanded ? "收起" : "查看更多";
  });
}

if (livestream && livestreamToggle) {
  const livestreamToggleLabel = livestreamToggle.querySelector("[data-livestream-toggle-label]");

  livestreamToggle.addEventListener("click", () => {
    const expanded = livestream.classList.toggle("is-expanded");
    livestreamToggle.setAttribute("aria-expanded", String(expanded));
    if (livestreamToggleLabel) livestreamToggleLabel.textContent = expanded ? "收起" : "查看更多";
  });
}

function livestreamImageType(filename) {
  if (filename.includes("poster")) return "主视觉";
  if (filename.includes("render")) return "渲染图";
  if (filename.includes("detail")) return "细节图";
  if (filename.includes("live")) return "现场图";
  return "项目图片";
}

function createLivestreamArrow(direction, title) {
  const button = document.createElement("button");
  const visibleLabel = document.createElement("span");
  button.className = `livestream-arrow livestream-arrow-${direction}`;
  button.type = "button";
  button.setAttribute("aria-label", `${direction === "prev" ? "向左" : "向右"}浏览：${title}`);
  button.dataset.livestreamDirection = direction === "prev" ? "-1" : "1";
  visibleLabel.setAttribute("aria-hidden", "true");
  visibleLabel.textContent = direction === "prev" ? "←" : "→";
  button.appendChild(visibleLabel);
  return button;
}

function setupLivestreamCarousel(projectElement) {
  const scroller = projectElement.querySelector("[data-livestream-scroller]");
  const controls = projectElement.querySelector("[data-livestream-controls]");
  const arrows = [...projectElement.querySelectorAll("[data-livestream-direction]")];
  if (!scroller || !controls || arrows.length !== 2) return;

  let holdFrame = 0;
  let holdDirection = 0;
  let previousTimestamp = 0;
  let resumeTimer = 0;

  function updateControls() {
    const maxScroll = Math.max(0, scroller.scrollWidth - scroller.clientWidth);
    const overflows = maxScroll > 2;
    controls.hidden = !overflows;
    arrows[0].disabled = !overflows || scroller.scrollLeft <= 1;
    arrows[1].disabled = !overflows || scroller.scrollLeft >= maxScroll - 1;
  }

  function stopHold() {
    holdDirection = 0;
    previousTimestamp = 0;
    window.cancelAnimationFrame(holdFrame);
    holdFrame = 0;
  }

  function holdScroll(timestamp) {
    if (!holdDirection) return;
    if (!previousTimestamp) previousTimestamp = timestamp;
    const elapsed = Math.min(timestamp - previousTimestamp, 40);
    previousTimestamp = timestamp;
    scroller.scrollLeft += holdDirection * 64 * (elapsed / 1000);
    updateControls();

    const activeArrow = holdDirection < 0 ? arrows[0] : arrows[1];
    if (activeArrow.disabled) {
      stopHold();
      return;
    }

    holdFrame = window.requestAnimationFrame(holdScroll);
  }

  function startHold(direction) {
    if (reducedMotion.matches || !precisePointer.matches) return;
    const activeArrow = direction < 0 ? arrows[0] : arrows[1];
    if (activeArrow.disabled || holdDirection === direction) return;
    stopHold();
    holdDirection = direction;
    holdFrame = window.requestAnimationFrame(holdScroll);
  }

  function moveByViewport(direction, button) {
    stopHold();
    window.clearTimeout(resumeTimer);
    scroller.scrollBy({
      left: direction * scroller.clientWidth * 0.7,
      behavior: reducedMotion.matches ? "auto" : "smooth",
    });
    resumeTimer = window.setTimeout(() => {
      if (button.matches(":hover")) startHold(direction);
    }, reducedMotion.matches ? 0 : 480);
  }

  arrows.forEach((button) => {
    const direction = Number(button.dataset.livestreamDirection);
    button.addEventListener("pointerenter", (event) => {
      if (event.pointerType === "mouse") startHold(direction);
    });
    button.addEventListener("pointerleave", () => {
      window.clearTimeout(resumeTimer);
      stopHold();
    });
    button.addEventListener("click", () => moveByViewport(direction, button));
  });

  scroller.addEventListener("scroll", updateControls, { passive: true });
  scroller.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    moveByViewport(event.key === "ArrowLeft" ? -1 : 1, arrows[event.key === "ArrowLeft" ? 0 : 1]);
  });
  projectElement.querySelectorAll("img").forEach((image) => {
    image.addEventListener("load", updateControls, { once: true });
    image.addEventListener("error", () => image.classList.add("is-missing"), { once: true });
  });
  window.addEventListener("blur", stopHold);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stopHold();
  });

  if ("ResizeObserver" in window) {
    const resizeObserver = new ResizeObserver(updateControls);
    resizeObserver.observe(scroller);
  } else {
    window.addEventListener("resize", updateControls, { passive: true });
  }

  window.requestAnimationFrame(updateControls);
}

function createLivestreamProject(project, projectIndex, imageDimensions) {
  const article = document.createElement("article");
  const carousel = document.createElement("div");
  const scroller = document.createElement("div");
  const imageList = document.createElement("ul");
  const controls = document.createElement("div");
  const meta = document.createElement("div");
  const title = document.createElement("h3");
  const category = document.createElement("p");
  const titleId = `livestream-project-${String(projectIndex + 1).padStart(2, "0")}`;

  article.className = "livestream-project";
  article.setAttribute("aria-labelledby", titleId);
  article.dataset.livestreamProject = project.id;
  carousel.className = "livestream-carousel";
  scroller.className = "livestream-scroller";
  scroller.dataset.livestreamScroller = "";
  scroller.tabIndex = 0;
  scroller.setAttribute("role", "region");
  scroller.setAttribute("aria-label", `${project.title}图片，共 ${project.images.length} 张`);
  imageList.className = "livestream-list";

  project.images.forEach((filename, imageIndex) => {
    const item = document.createElement("li");
    const image = document.createElement("img");
    const imageNumber = String(imageIndex + 1).padStart(2, "0");
    const imageRef = typeof filename === "string"
      ? { name: filename, url: `https://media.kjoe.top/media-v0.21/assets/images/livestream/${project.directory}/${filename}` }
      : filename;
    const dimensions = imageRef.dimensions || imageDimensions[`${project.directory}/${imageRef.name}`] || [1200, 800];
    if (!Array.isArray(dimensions) || dimensions.length !== 2) {
      throw new Error(`Invalid livestream image dimensions: ${project.title}`);
    }
    item.className = "livestream-slide";
    image.width = dimensions[0];
    image.height = dimensions[1];
    image.src = imageRef.url;
    image.alt = `${project.title} ${livestreamImageType(imageRef.name || "项目图片")} ${imageNumber}`;
    image.decoding = "async";
    image.draggable = false;
    if (projectIndex === 0 && imageIndex < 3) {
      image.loading = "eager";
      if (imageIndex === 0) image.setAttribute("fetchpriority", "high");
    } else {
      image.loading = "lazy";
    }
    item.appendChild(image);
    imageList.appendChild(item);
  });

  scroller.appendChild(imageList);
  controls.className = "livestream-controls";
  controls.dataset.livestreamControls = "";
  controls.hidden = true;
  controls.append(
    createLivestreamArrow("prev", project.title),
    createLivestreamArrow("next", project.title),
  );
  carousel.append(scroller, controls);

  meta.className = "livestream-meta";
  title.id = titleId;
  title.textContent = project.title;
  category.textContent = project.category;
  meta.append(title, category);
  article.append(carousel, meta);
  return article;
}

function restoreRequestedHashPosition() {
  const requestedHash = window.location.hash || window.__requestedInitialHash;
  if (!requestedHash) return;

  let targetId;
  try {
    targetId = decodeURIComponent(requestedHash.slice(1));
  } catch {
    return;
  }

  const hashTarget = document.getElementById(targetId);
  if (!hashTarget) return;

  if (window.__requestedInitialHash) {
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${window.location.search}${requestedHash}`,
    );
    window.__requestedInitialHash = "";
  }

  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      const previousScrollBehavior = document.documentElement.style.scrollBehavior;
      document.documentElement.style.scrollBehavior = "auto";
      hashTarget.scrollIntoView({ block: "start", behavior: "auto" });
      window.requestAnimationFrame(() => {
        document.documentElement.style.scrollBehavior = previousScrollBehavior;
      });
    });
  });
}

async function loadLivestreamProjects() {
  if (!livestream || !livestreamProjects) return;

  try {
    let projects;
    let imageDimensions;
    let usingRemote = false;

    if (window.PORTFOLIO_CONTENT?.publicApiUrl && typeof window.PORTFOLIO_CONTENT.loadPublished === "function") {
      const published = await loadPublishedContent();
      if (published?.livestream?.length) {
        projects = published.livestream;
        imageDimensions = published.imageDimensions || {};
        usingRemote = true;
      }
    }

    if (!usingRemote && window.location.protocol === "file:" && window.LIVESTREAM_DATA) {
      ({ projects, imageDimensions } = window.LIVESTREAM_DATA);
    } else if (!usingRemote) {
      try {
        const [projectsResponse, dimensionsResponse] = await Promise.all([
          fetch(livestream.dataset.projectsSrc),
          fetch(livestream.dataset.dimensionsSrc),
        ]);
        if (!projectsResponse.ok) {
          throw new Error(`Livestream data request failed: ${projectsResponse.status}`);
        }
        if (!dimensionsResponse.ok) {
          throw new Error(`Livestream dimensions request failed: ${dimensionsResponse.status}`);
        }
        [projects, imageDimensions] = await Promise.all([
          projectsResponse.json(),
          dimensionsResponse.json(),
        ]);
      } catch (requestError) {
        if (!window.LIVESTREAM_DATA) throw requestError;
        ({ projects, imageDimensions } = window.LIVESTREAM_DATA);
      }
    }

    const imageCount = projects.reduce((total, project) => total + project.images.length, 0);
    const dimensionsCount = Object.keys(imageDimensions).length;
    if (!usingRemote && (projects.length !== 8 || imageCount !== 55 || dimensionsCount !== 55)) {
      throw new Error(
        `Unexpected livestream data: ${projects.length} projects, ${imageCount} images, ${dimensionsCount} dimensions`,
      );
    }

    const fragment = document.createDocumentFragment();
    projects.forEach((project, projectIndex) => {
      fragment.appendChild(createLivestreamProject(project, projectIndex, imageDimensions));
    });
    if (livestreamHydrationCancelled) return;
    livestreamProjects.replaceChildren(fragment);
    livestreamProjects.setAttribute("aria-busy", "false");
    if (livestreamActions) livestreamActions.hidden = projects.length <= 3;
    livestreamProjects.querySelectorAll(".livestream-project").forEach(setupLivestreamCarousel);
    setupSectionMotion(
      livestream,
      ".livestream-header, .livestream-project",
      "livestream-motion-ready",
      "livestream-reveal",
    );
  } catch (error) {
    const message = document.createElement("p");
    message.className = "livestream-error";
    message.setAttribute("role", "alert");
    message.textContent = "直播作品载入失败，请刷新页面后重试。";
    livestreamProjects.replaceChildren(message);
    livestreamProjects.setAttribute("aria-busy", "false");
    if (livestreamActions) livestreamActions.hidden = true;
    console.error(error);
  } finally {
    restoreRequestedHashPosition();
  }
}

const livestreamHydrationPromise = loadLivestreamProjects();

async function hydrateTvcWorks() {
  if (!works || !window.PORTFOLIO_CONTENT?.publicApiUrl || typeof window.PORTFOLIO_CONTENT.loadPublished !== "function") return;
  try {
    const published = await loadPublishedContent();
    if (!published?.tvc?.length) return;
    const grid = works.querySelector("#works-grid");
    if (!grid) return;
    const fragment = document.createDocumentFragment();
    published.tvc.forEach((work) => {
      const card = document.createElement("article");
      card.className = "work-card";
      card.dataset.work = work.id;
      if (work.video) card.dataset.videoUrl = work.video;
      const picture = document.createElement("picture");
      picture.className = "work-poster";
      const image = document.createElement("img");
      image.src = work.poster;
      image.alt = `${work.brand} ${work.title} 视频封面`;
      image.loading = "lazy";
      image.decoding = "async";
      picture.appendChild(image);
      const meta = document.createElement("div");
      meta.className = "work-meta";
      const line = document.createElement("p");
      line.className = "work-meta-line";
      const brand = document.createElement("span");
      brand.textContent = work.brand;
      const category = document.createElement("span");
      category.textContent = work.category;
      line.append(brand, category);
      const title = document.createElement("h3");
      title.textContent = work.title;
      meta.append(line, title);
      card.append(picture, meta);
      fragment.appendChild(card);
    });
    if (tvcHydrationCancelled) return;
    grid.replaceChildren(fragment);
    grid.querySelectorAll(".work-card[data-work]").forEach(bindWorkPlayButton);
  } catch (error) {
    console.warn("Published TVC content unavailable; using bundled fallback.", error);
  }
}

async function loadPublishedContent() {
  try {
    return await window.PORTFOLIO_CONTENT.loadPublished();
  } catch (error) {
    console.warn("Published works content unavailable; using bundled fallback.", error);
    return null;
  }
}

function setupSectionMotion(container, itemSelector, readyClass, itemClass) {
  if (!container || reducedMotion.matches || !("IntersectionObserver" in window)) return;

  const revealItems = [...container.querySelectorAll(itemSelector)];
  if (!revealItems.length) return;
  if (itemClass) revealItems.forEach((item) => item.classList.add(itemClass));

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    },
    {
      rootMargin: "0px 0px -8%",
      threshold: 0.12,
    },
  );

  container.classList.add(readyClass);
  revealItems.forEach((item) => observer.observe(item));
}

setupSectionMotion(about, ".about-reveal", "about-motion-ready");
setupSectionMotion(works, ".works-header, .work-card", "works-motion-ready", "works-reveal");
setupSectionMotion(contact, ".contact-ending", "contact-motion-ready", "contact-reveal");

function dataSaverEnabled() {
  return Boolean(connection?.saveData);
}

function posterOnlyMode() {
  return reducedMotion.matches || dataSaverEnabled();
}

function setSiteLoaderProgress(value) {
  const progress = Math.round(clamp(value, 0, 100));
  if (siteLoaderFill) siteLoaderFill.style.width = `${progress}%`;
  if (siteLoaderPercent) siteLoaderPercent.textContent = `${progress}%`;
  siteLoaderTrack?.setAttribute("aria-valuenow", String(progress));
}

function getPreloadImageUrl(image) {
  if (image.currentSrc) return image.currentSrc;

  const source = image.closest("picture")?.querySelector("source[srcset]");
  if (source && (!source.media || window.matchMedia(source.media).matches)) {
    return source.srcset.split(",")[0].trim().split(/\s+/)[0];
  }

  return image.src;
}

function preloadImage(url) {
  return new Promise((resolve) => {
    if (!url) {
      resolve();
      return;
    }

    const image = new Image();
    const finish = () => {
      image.onload = null;
      image.onerror = null;
      resolve();
    };
    image.onload = finish;
    image.onerror = finish;
    image.src = url;
    if (image.complete) finish();
  });
}

function preloadVideo(video) {
  return new Promise((resolve) => {
    if (!video) {
      resolve();
      return;
    }

    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      window.clearTimeout(timeout);
      video.removeEventListener("canplaythrough", finish);
      video.removeEventListener("error", finish);
      resolve();
    };
    const timeout = window.setTimeout(finish, 12000);

    video.addEventListener("canplaythrough", finish, { once: true });
    video.addEventListener("error", finish, { once: true });
    video.preload = "auto";
    const sourceChanged = loadDeferredVideo(video);
    if (!sourceChanged) video.load();
    if (video.readyState >= 3) finish();
  });
}

async function startSiteLoader(tvcHydrationPromise, livestreamHydrationPromise) {
  if (!siteLoader) {
    siteLoaderReady = true;
    return;
  }

  const minimumLoaderDuration = 2000;
  const loaderStartedAt = performance.now();
  setSiteLoaderProgress(0);

  let hydrationTimedOut = false;
  try {
    await Promise.race([
      Promise.all([tvcHydrationPromise, livestreamHydrationPromise]),
      new Promise((resolve) =>
        window.setTimeout(() => {
          hydrationTimedOut = true;
          resolve();
        }, 8000),
      ),
    ]);
  } catch {
    // Bundled TVC fallback remains available when the published data request fails.
  }
  if (hydrationTimedOut) {
    tvcHydrationCancelled = true;
    livestreamHydrationCancelled = true;
  }

  const resources = [];
  if (!posterOnlyMode()) {
    videos.forEach((video) => resources.push(() => preloadVideo(video)));
  }

  const imageUrls = [
    ...document.querySelectorAll(
      ".panel-poster img, .work-poster img, .livestream-project img, .about-portrait img",
    ),
  ]
    .map(getPreloadImageUrl)
    .filter(Boolean);
  [...new Set(imageUrls)].forEach((url) => resources.push(() => preloadImage(url)));

  let completedResources = 0;
  const totalResources = resources.length;
  const updateResourceProgress = () => {
    const progress = totalResources ? (completedResources / totalResources) * 95 : 0;
    setSiteLoaderProgress(progress);
  };

  await Promise.all(
    resources.map((load) =>
      load().finally(() => {
        completedResources += 1;
        updateResourceProgress();
      }),
    ),
  );

  const remainingDuration = minimumLoaderDuration - (performance.now() - loaderStartedAt);
  if (remainingDuration > 0) {
    await new Promise((resolve) => {
      const animationStartedAt = performance.now();
      const animateFinish = () => {
        const progress = clamp((performance.now() - animationStartedAt) / remainingDuration, 0, 1);
        setSiteLoaderProgress(95 + progress * 5);
        if (progress < 1) window.requestAnimationFrame(animateFinish);
        else resolve();
      };
      window.requestAnimationFrame(animateFinish);
    });
  }

  siteLoaderReady = true;
  document.body.classList.remove("loader-active");
  setSiteLoaderProgress(100);
  siteLoader.classList.add("is-complete");
  window.setTimeout(() => siteLoader.remove(), 420);
  requestFrameUpdate();
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
  return sourceChanged;
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
    !siteLoaderReady ||
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
  const remoteVideo = card.dataset.videoUrl;
  if ((!slug || !base) && !remoteVideo) return;

  workPlayerTrigger = trigger;
  workPlayerOpen = true;
  workPlayerUrl = remoteVideo || `${new URL(`${slug}.mp4`, base).href}?v=0.21`;
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

function bindWorkPlayButton(card) {
  if (!card || card.querySelector(".work-play")) return;
  const title = card.querySelector("h3")?.textContent?.trim() || "作品";
  const playButton = document.createElement("button");
  playButton.className = "work-play";
  playButton.type = "button";
  playButton.setAttribute("aria-label", `全屏播放：${title}`);
  playButton.addEventListener("click", () => openWorkPlayer(card, playButton));
  card.appendChild(playButton);
}

if (works && workPlayer && workPlayerVideo) {
  works.querySelectorAll(".work-card[data-work]").forEach((card) => {
    bindWorkPlayButton(card);
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
  if (activeVideo && siteLoaderReady && !posterOnlyMode()) {
    loadDeferredVideo(activeVideo);
    tryPlay(activeVideo);
  }
}

function measureIntroSequence() {
  if (!sequence || scenes.length < 2) return;

  const firstTrack = scenes[0];
  const secondTrack = scenes[1];
  const viewportHeight = firstTrack.querySelector(".media-panel")?.offsetHeight || window.innerHeight;
  const firstHoldEnd = Math.max(firstTrack.offsetHeight - viewportHeight, 1);

  introMetrics = {
    viewportHeight,
    sequenceHeight: sequence.offsetHeight,
    firstHoldEnd,
    heroFrameEnd: Math.min(firstHoldEnd, Math.max(viewportHeight * 0.3, 1)),
    firstExitEnd: firstTrack.offsetTop + firstTrack.offsetHeight,
    secondHoldEnd:
      secondTrack.offsetTop + Math.max(secondTrack.offsetHeight - viewportHeight, 1),
  };
}

function updateHeroSurfaceProgress(distance) {
  if (!sequence || !introMetrics) return;

  const progress = reducedMotion.matches
    ? Number(distance > 0)
    : smoothstep(0, introMetrics.heroFrameEnd, distance);
  const channel = Math.round(255 * (1 - progress));

  sequence.style.setProperty("--hero-frame-progress", progress.toFixed(4));
  header?.style.setProperty("--hero-nav-color", `rgb(${channel} ${channel} ${channel})`);
  header?.style.setProperty("--hero-logo-invert", String(1 - progress));
}

function updateIntroSequence() {
  if (!sequence || !introMetrics) return;

  const rect = sequence.getBoundingClientRect();
  const distance = clamp(-rect.top, 0, introMetrics.sequenceHeight);
  updateHeroSurfaceProgress(distance);
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
    siteLoaderReady &&
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
  updateIntroSequence();
  if (sequenceInView && !document.hidden) requestFrameUpdate();
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
const tvcHydrationPromise = hydrateTvcWorks();
startSiteLoader(tvcHydrationPromise, livestreamHydrationPromise);
applyMotionPreference();

if ("IntersectionObserver" in window) {
  if (scrollSentinel) {
    const headerObserver = new IntersectionObserver(([entry]) => {
      header?.classList.toggle("is-scrolled", !entry.isIntersecting);
    });
    headerObserver.observe(scrollSentinel);
  }

  if (sequence) {
    const sequenceObserver = new IntersectionObserver(([entry]) => {
      sequenceInView = entry.isIntersecting;
      requestFrameUpdate();
    });
    sequenceObserver.observe(sequence);
  }
}

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
