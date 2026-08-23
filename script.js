document.documentElement.classList.add("has-js");

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
const videos = [...document.querySelectorAll("[data-autoplay-video]")];
const sequence = document.querySelector("[data-intro-sequence]");
const introStage = sequence?.querySelector("[data-intro-stage]");
const scenes = [...document.querySelectorAll(".media-panel[data-scene]")];
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
const mobileIntroFlip = window.matchMedia("(max-width: 768px)");
const siteLoader = document.querySelector("[data-site-loader]");
const siteLoaderTrack = siteLoader?.querySelector("[data-loader-track]");
const siteLoaderFill = siteLoader?.querySelector("[data-loader-fill]");
const siteLoaderPercent = siteLoader?.querySelector("[data-loader-percent]");

window.JOEKUNI_LIVESTREAM_REACT?.mountStrokeHeadings?.(
  document.querySelectorAll("[data-stroke-heading]"),
);

const aboutLanyard = document.querySelector("[data-about-lanyard]");
if (aboutLanyard && !reducedMotion.matches) {
  window.JOEKUNI_LIVESTREAM_REACT?.mountAboutLanyard?.(
    aboutLanyard,
    aboutLanyard.dataset.frontImage,
  );
}

let introMetrics;
let introRawFlipProgress = 0;
let introDisplayedFlipProgress = 0;
let introDisplayedHeroTextProgress = 0;
let introFlipTimeline;
let introSnapSide = 0;
let introScrollSettleTimer = 0;
let introLastScrollY = window.scrollY;
let introLastFrameTime = 0;
let animationFrameRequested = false;
let sequenceInView = true;
let activeSceneIndex = -1;
let workPlayerOpen = false;
let workPlayerTrigger = null;
let workPlayerUrl = "";
let siteLoaderReady = false;
let tvcHydrationCancelled = false;
let livestreamHydrationCancelled = false;
let refreshWorksMotion = () => {};
let refreshLivestreamMotion = () => {};
const userPausedVideos = new WeakSet();

if (works && worksToggle) {
  const worksToggleLabel = worksToggle.querySelector("[data-works-toggle-label]");

  worksToggle.addEventListener("click", () => {
    const expanded = works.classList.toggle("is-expanded");
    worksToggle.setAttribute("aria-expanded", String(expanded));
    if (worksToggleLabel) worksToggleLabel.textContent = expanded ? "收起" : "查看更多";
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => refreshWorksMotion(expanded)));
  });
}

if (livestream && livestreamToggle) {
  const livestreamToggleLabel = livestreamToggle.querySelector("[data-livestream-toggle-label]");

  livestreamToggle.addEventListener("click", () => {
    const expanded = livestream.classList.toggle("is-expanded");
    livestreamToggle.setAttribute("aria-expanded", String(expanded));
    if (livestreamToggleLabel) livestreamToggleLabel.textContent = expanded ? "收起" : "查看更多";
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => refreshLivestreamMotion(expanded)));
  });
}

function livestreamImageType(filename) {
  if (filename.includes("poster")) return "主视觉";
  if (filename.includes("render")) return "渲染图";
  if (filename.includes("detail")) return "细节图";
  if (filename.includes("live")) return "现场图";
  return "项目图片";
}

function setupDepthCarousel(projectElement) {
  const root = projectElement.querySelector("[data-depth-carousel]");
  const stage = root?.querySelector("[data-depth-stage]");
  const cards = [...(root?.querySelectorAll("[data-depth-card]") || [])];
  const dots = [...(root?.querySelectorAll("[data-depth-dot]") || [])];
  const arrows = [...(root?.querySelectorAll("[data-depth-direction]") || [])];
  if (!root || !stage || !cards.length) return;

  const config = { depth: 92, spread: 42, tilt: 10, visibleCards: 4 };
  const count = cards.length;
  let position = 0;
  let activeIndex = 0;
  let drag = null;
  let wheelTimer = 0;
  let settleTimer = 0;
  let suppressClick = false;

  const wrappedDistance = (index, current) => {
    let distance = index - current;
    if (count > 1) {
      distance = ((distance % count) + count) % count;
      if (distance > count / 2) distance -= count;
    }
    return distance;
  };

  const layout = (current, animate = false) => {
    cards.forEach((card, index) => {
      const distance = wrappedDistance(index, current);
      const back = Math.max(0, distance);
      const shown = Math.abs(distance) <= config.visibleCards + 0.5;
      const opacity = distance < 0 ? clamp(1 + distance, 0, 1) : shown ? 1 : 0;
      const scale = 1 - Math.min(back * 0.035, 0.16);
      const translateX = back * config.spread;
      const translateZ = -back * config.depth;
      const rotateY = back * config.tilt;

      card.style.transition = animate
        ? "transform 700ms cubic-bezier(0.22, 1, 0.36, 1), opacity 420ms ease, filter 700ms ease"
        : "none";
      card.style.transform = `translate(-50%, -50%) translate3d(${translateX.toFixed(2)}px, 0, ${translateZ.toFixed(2)}px) rotateY(${rotateY.toFixed(2)}deg) scale(${scale.toFixed(3)})`;
      card.style.opacity = opacity.toFixed(3);
      card.style.filter = `brightness(${Math.max(0.62, 1 - back * 0.1).toFixed(3)}) blur(${Math.min(3, back * 0.7).toFixed(2)}px)`;
      card.style.zIndex = String(2000 - Math.round(distance * 20));
      card.style.pointerEvents = shown && opacity > 0.05 ? "auto" : "none";
      card.tabIndex = index === activeIndex ? 0 : -1;
      card.setAttribute("aria-hidden", String(index !== activeIndex));
      card.setAttribute("aria-current", String(index === activeIndex));
    });

    dots.forEach((dot, index) => {
      dot.classList.toggle("is-active", index === activeIndex);
      dot.setAttribute("aria-selected", String(index === activeIndex));
    });
  };

  const focusIndex = (rawIndex, animate = true) => {
    const nextIndex = ((rawIndex % count) + count) % count;
    let delta = nextIndex - position;
    if (count > 1) {
      delta = ((delta % count) + count) % count;
      if (delta > count / 2) delta -= count;
    }
    activeIndex = nextIndex;
    position += delta;
    layout(position, animate && !reducedMotion.matches);
    window.clearTimeout(settleTimer);
    settleTimer = window.setTimeout(() => {
      position = activeIndex;
      layout(position, false);
    }, animate && !reducedMotion.matches ? 720 : 0);
  };

  const stopDrag = (event) => {
    if (!drag) return;
    const currentDrag = drag;
    drag = null;
    root.classList.remove("is-dragging");
    if (root.hasPointerCapture?.(currentDrag.pointerId)) {
      root.releasePointerCapture(currentDrag.pointerId);
    }
    if (!currentDrag.moved) return;
    suppressClick = true;
    window.setTimeout(() => {
      suppressClick = false;
    }, 0);
    const projected = position - currentDrag.velocity * 180 / Math.max(1, root.clientWidth * 0.34);
    focusIndex(Math.round(projected));
    event?.preventDefault();
  };

  root.addEventListener("pointerdown", (event) => {
    if (event.target.closest(".depth-carousel-arrow, .depth-carousel-dot") || count < 2) return;
    drag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      lastX: event.clientX,
      lastTime: performance.now(),
      velocity: 0,
      moved: false,
    };
    root.setPointerCapture?.(event.pointerId);
  });

  root.addEventListener("pointermove", (event) => {
    if (!drag) return;
    const deltaX = event.clientX - drag.startX;
    if (!drag.moved && Math.abs(deltaX) > 5) {
      drag.moved = true;
      root.classList.add("is-dragging");
    }
    if (!drag.moved) return;
    const now = performance.now();
    drag.velocity = (event.clientX - drag.lastX) / Math.max(1, now - drag.lastTime);
    drag.lastX = event.clientX;
    drag.lastTime = now;
    position = activeIndex + (drag.startX - event.clientX) / Math.max(1, root.clientWidth * 0.34);
    layout(position, false);
  });

  root.addEventListener("pointerup", stopDrag);
  root.addEventListener("pointercancel", stopDrag);

  root.addEventListener("wheel", (event) => {
    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY)
      ? event.deltaX
      : event.shiftKey
        ? event.deltaY
        : 0;
    if (count < 2 || Math.abs(delta) < 8) return;
    event.preventDefault();
    focusIndex(activeIndex + (delta > 0 ? 1 : -1));
    window.clearTimeout(wheelTimer);
    wheelTimer = window.setTimeout(() => layout(position, false), 140);
  }, { passive: false });

  root.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    focusIndex(activeIndex + (event.key === "ArrowRight" ? 1 : -1));
  });

  arrows.forEach((button) => {
    button.addEventListener("click", () => {
      focusIndex(activeIndex + Number(button.dataset.depthDirection));
    });
  });

  dots.forEach((dot) => {
    dot.addEventListener("click", () => focusIndex(Number(dot.dataset.depthDot)));
  });

  cards.forEach((card) => {
    card.addEventListener("click", () => {
      if (suppressClick) return;
      focusIndex(Number(card.dataset.depthIndex));
    });
    card.querySelector("img")?.addEventListener("error", () => card.classList.add("is-missing"), { once: true });
  });

  root.dataset.depthReady = "true";
  layout(position, false);
}

function createLivestreamProject(project, projectIndex, imageDimensions) {
  const article = document.createElement("article");
  const carousel = document.createElement("div");
  const stage = document.createElement("div");
  const controls = document.createElement("div");
  const indicators = document.createElement("div");
  const meta = document.createElement("div");
  const title = document.createElement("h3");
  const category = document.createElement("p");
  const titleId = `livestream-project-${String(projectIndex + 1).padStart(2, "0")}`;

  article.className = "livestream-project";
  article.setAttribute("aria-labelledby", titleId);
  article.dataset.livestreamProject = project.id;
  carousel.className = "livestream-carousel depth-carousel";
  carousel.dataset.depthCarousel = "";
  carousel.tabIndex = 0;
  carousel.setAttribute("role", "group");
  carousel.setAttribute("aria-roledescription", "carousel");
  carousel.setAttribute("aria-label", `${project.title}图片，共 ${project.images.length} 张`);
  stage.className = "depth-carousel-stage";
  stage.dataset.depthStage = "";

  project.images.forEach((filename, imageIndex) => {
    const item = document.createElement("button");
    const image = document.createElement("img");
    const imageNumber = String(imageIndex + 1).padStart(2, "0");
    const imageRef = typeof filename === "string"
      ? { name: filename, url: `https://media.kjoe.top/media-v0.21/assets/images/livestream/${project.directory}/${filename}` }
      : filename;
    const dimensions = imageRef.dimensions || imageDimensions[`${project.directory}/${imageRef.name}`] || [1200, 800];
    if (!Array.isArray(dimensions) || dimensions.length !== 2) {
      throw new Error(`Invalid livestream image dimensions: ${project.title}`);
    }
    item.type = "button";
    item.className = "depth-carousel-card";
    item.dataset.depthCard = "";
    item.dataset.depthIndex = String(imageIndex);
    item.setAttribute("aria-label", `${project.title}第 ${imageNumber} 张图片`);
    item.style.setProperty("--depth-image-ratio", String(dimensions[0] / dimensions[1]));
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
    stage.appendChild(item);
  });

  controls.className = "depth-carousel-controls";
  controls.append(
    createDepthCarouselArrow("prev", project.title, -1),
    createDepthCarouselArrow("next", project.title, 1),
  );

  indicators.className = "depth-carousel-dots";
  indicators.setAttribute("role", "tablist");
  indicators.setAttribute("aria-label", `${project.title}图片导航`);
  project.images.forEach((_, imageIndex) => {
    const dot = document.createElement("button");
    dot.type = "button";
    dot.className = "depth-carousel-dot";
    dot.dataset.depthDot = String(imageIndex);
    dot.setAttribute("role", "tab");
    dot.setAttribute("aria-label", `查看第 ${imageIndex + 1} 张图片`);
    indicators.appendChild(dot);
  });
  carousel.append(stage, controls, indicators);

  meta.className = "livestream-meta";
  title.id = titleId;
  title.textContent = project.title;
  category.textContent = project.category;
  meta.append(title, category);
  article.append(carousel, meta);
  return article;
}

function createDepthCarouselArrow(direction, title, step) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `depth-carousel-arrow depth-carousel-arrow-${direction}`;
  button.dataset.depthDirection = String(step);
  button.setAttribute("aria-label", `${direction === "prev" ? "向左" : "向右"}浏览：${title}`);
  button.innerHTML = `<span aria-hidden="true">${direction === "prev" ? "←" : "→"}</span>`;
  return button;
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

    if (livestreamHydrationCancelled) return;
    const reactMount = window.JOEKUNI_LIVESTREAM_REACT?.mount;
    let mountedWithReact = false;
    if (typeof reactMount === "function") {
      try {
        mountedWithReact = reactMount(livestreamProjects, projects, imageDimensions) === true;
      } catch (error) {
        console.warn("React livestream carousel unavailable; using native fallback.", error);
      }
    }
    if (!mountedWithReact) {
      const fragment = document.createDocumentFragment();
      projects.forEach((project, projectIndex) => {
        fragment.appendChild(createLivestreamProject(project, projectIndex, imageDimensions));
      });
      livestreamProjects.replaceChildren(fragment);
    }
    livestreamProjects.setAttribute("aria-busy", "false");
    if (livestreamActions) livestreamActions.hidden = projects.length <= 3;
    const setupLivestreamMotion = () => {
      if (!mountedWithReact) livestreamProjects.querySelectorAll(".livestream-project").forEach(setupDepthCarousel);
    };
    if (mountedWithReact) window.requestAnimationFrame(setupLivestreamMotion);
    else setupLivestreamMotion();
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

function setupWorksGsapMotion() {
  const gsap = window.gsap;
  const ScrollTrigger = window.ScrollTrigger;
  if (!works || !gsap || !ScrollTrigger) {
    setupSectionMotion(works, ".works-header, .work-card", "works-motion-ready", "works-reveal");
    return;
  }

  gsap.registerPlugin(ScrollTrigger);
  works.classList.add("gsap-works-ready");
  const pointerCleanups = [];
  const media = gsap.matchMedia();

  media.add(
    {
      desktop: "(min-width: 769px) and (hover: hover) and (pointer: fine)",
      mobile: "(max-width: 768px)",
      reduceMotion: "(prefers-reduced-motion: reduce)",
    },
    (context) => {
      const { desktop, mobile, reduceMotion } = context.conditions;
      const heading = works.querySelector(".works-header");
      const headingTitle = heading?.querySelector("h2");
      const headingKicker = heading?.querySelector(".works-kicker");

      if (reduceMotion) {
        gsap.set([headingTitle, headingKicker, ...works.querySelectorAll(".work-card")], {
          clearProps: "all",
        });
        return undefined;
      }

      if (heading && headingTitle) {
        gsap.timeline({
          scrollTrigger: {
            trigger: heading,
            start: "top 84%",
            once: true,
          },
        })
          .fromTo(
            headingTitle,
            { autoAlpha: 0, yPercent: 82, skewY: 5 },
            { autoAlpha: 1, yPercent: 0, skewY: 0, duration: 0.82, ease: "power4.out" },
          )
          .fromTo(
            headingKicker,
            { autoAlpha: 0, x: 36 },
            { autoAlpha: 1, x: 0, duration: 0.5, ease: "power3.out" },
            "-=0.42",
          );
      }

      const grid = works.querySelector(".works-grid");
      const rowSize = mobile ? 1 : 2;
      const registeredRows = new Map();
      const pointerBoundCards = new WeakSet();
      let activeFocusRow = [];

      const setFocusRow = (row, isActive) => {
        if (!desktop) return;
        if (isActive) {
          if (activeFocusRow === row) return;
          activeFocusRow.forEach((card) => card.classList.remove("is-motion-focus"));
          if (activeFocusRow.length) {
            gsap.to(activeFocusRow, { scale: 1, duration: 0.36, ease: "power3.out", overwrite: "auto" });
          }
          activeFocusRow = row;
          row.forEach((card) => card.classList.add("is-motion-focus"));
          grid?.classList.add("has-motion-focus");
          gsap.to(row, {
            scale: isActive ? 1.018 : 1,
            duration: 0.42,
            ease: "power3.out",
            overwrite: "auto",
          });
          return;
        }
        if (activeFocusRow !== row) return;
        row.forEach((card) => card.classList.remove("is-motion-focus"));
        gsap.to(row, { scale: 1, duration: 0.36, ease: "power3.out", overwrite: "auto" });
        activeFocusRow = [];
        grid?.classList.remove("has-motion-focus");
      };

      function resetWorksRow(row) {
        const posters = row.map((card) => card.querySelector(".work-poster")).filter(Boolean);
        const metas = row.map((card) => card.querySelector(".work-meta")).filter(Boolean);
        gsap.killTweensOf([...row, ...posters, ...metas]);
        gsap.set(row, { autoAlpha: 0 });
        gsap.set(posters, { scale: 0.97 });
        gsap.set(metas, { autoAlpha: 0 });
      }

      function playWorksRow(row, direction) {
        const entrance = gsap.timeline({ defaults: { overwrite: "auto" } });

        row.forEach((card, rowIndex) => {
          const side = rowSize === 1 || rowIndex === 0 ? -1 : 1;
          const poster = card.querySelector(".work-poster");
          const meta = card.querySelector(".work-meta");
          gsap.killTweensOf([card, poster, meta].filter(Boolean));
          gsap.set(card, {
            autoAlpha: 0,
            x: side * (mobile ? 24 : 44),
            y: direction * (mobile ? 34 : 48),
            rotationZ: side * (mobile ? 1.5 : 2.5),
          });
          if (poster) gsap.set(poster, { scale: 0.97 });
          if (meta) gsap.set(meta, { autoAlpha: 0, y: direction * 26 });

          entrance.to(
            card,
            {
              autoAlpha: 1,
              x: 0,
              y: 0,
              rotationZ: 0,
              duration: mobile ? 0.68 : 0.78,
              ease: "power3.out",
            },
            0,
          );
          if (poster) {
            entrance.to(
              poster,
              { scale: 1, duration: mobile ? 0.68 : 0.78, ease: "power3.out" },
              0,
            );
          }
          if (meta) {
            entrance.to(
              meta,
              { autoAlpha: 1, y: 0, duration: 0.54, ease: "power3.out" },
              0.22,
            );
          }
        });
        return entrance;
      }

      const bindWorksPointerDepth = (card) => {
        if (!desktop || pointerBoundCards.has(card)) return;
        const poster = card.querySelector(".work-poster");
        if (!poster) return;
        pointerBoundCards.add(card);

            const rotateXTo = gsap.quickTo(poster, "rotationX", { duration: 0.42, ease: "power3.out" });
            const rotateYTo = gsap.quickTo(poster, "rotationY", { duration: 0.42, ease: "power3.out" });
            const xTo = gsap.quickTo(poster, "x", { duration: 0.42, ease: "power3.out" });
            const yTo = gsap.quickTo(poster, "y", { duration: 0.42, ease: "power3.out" });

            const onPointerMove = (event) => {
              const rect = card.getBoundingClientRect();
              const x = clamp((event.clientX - rect.left) / rect.width - 0.5, -0.5, 0.5);
              const y = clamp((event.clientY - rect.top) / rect.height - 0.5, -0.5, 0.5);
              rotateXTo(y * -5);
              rotateYTo(x * 6);
              xTo(x * 7);
              yTo(y * 5);
            };
            const onPointerLeave = () => {
              rotateXTo(0);
              rotateYTo(0);
              xTo(0);
              yTo(0);
            };

            card.addEventListener("pointermove", onPointerMove);
            card.addEventListener("pointerleave", onPointerLeave);
            pointerCleanups.push(() => {
              card.removeEventListener("pointermove", onPointerMove);
              card.removeEventListener("pointerleave", onPointerLeave);
            });
      };

      const unregisterHiddenRows = () => {
        registeredRows.forEach((record, key) => {
          if (key.offsetParent !== null) return;
          record.entranceTrigger.kill();
          record.focusTrigger?.kill();
          if (activeFocusRow === record.cards) {
            activeFocusRow = [];
            grid?.classList.remove("has-motion-focus");
          }
          record.cards.forEach((card) => card.classList.remove("is-motion-focus"));
          const posters = record.cards.map((card) => card.querySelector(".work-poster")).filter(Boolean);
          const metas = record.cards.map((card) => card.querySelector(".work-meta")).filter(Boolean);
          gsap.set([...record.cards, ...posters, ...metas], { clearProps: "all" });
          registeredRows.delete(key);
        });
      };

      const animateVisibleCards = (revealNew = false) => {
        unregisterHiddenRows();
        const cards = [...works.querySelectorAll(".work-card")].filter((card) => card.offsetParent !== null);
        const newRows = [];

        for (let rowStart = 0; rowStart < cards.length; rowStart += rowSize) {
          const row = cards.slice(rowStart, rowStart + rowSize);
          if (registeredRows.has(row[0])) continue;

          row.forEach(bindWorksPointerDepth);
          resetWorksRow(row);
          const entranceTrigger = ScrollTrigger.create({
            trigger: row[0],
            start: "top 90%",
            endTrigger: row[row.length - 1],
            end: "bottom 10%",
            onEnter: () => playWorksRow(row, 1),
            onEnterBack: () => playWorksRow(row, -1),
          });

          const focusTrigger = desktop
            ? ScrollTrigger.create({
                trigger: row[0],
                start: "top 60%",
                endTrigger: row[row.length - 1],
                end: "bottom 40%",
                onToggle: ({ isActive }) => setFocusRow(row, isActive),
              })
            : null;
          registeredRows.set(row[0], { cards: row, entranceTrigger, focusTrigger });
          newRows.push(row);
        }

        ScrollTrigger.refresh();
        if (revealNew) {
          newRows.forEach((row) => {
            const rect = row[0].getBoundingClientRect();
            if (rect.bottom < 0) playWorksRow(row, -1).progress(1);
            else if (rect.top < window.innerHeight) playWorksRow(row, 1);
          });
        }
      };

      refreshWorksMotion = animateVisibleCards;
      animateVisibleCards();
      return () => {
        refreshWorksMotion = () => {};
        registeredRows.forEach(({ entranceTrigger, focusTrigger }) => {
          entranceTrigger.kill();
          focusTrigger?.kill();
        });
        registeredRows.clear();
        pointerCleanups.splice(0).forEach((cleanup) => cleanup());
      };
    },
  );
}

function setupLivestreamGsapMotion() {
  const gsap = window.gsap;
  const ScrollTrigger = window.ScrollTrigger;
  if (!livestream || !gsap || !ScrollTrigger) {
    setupSectionMotion(
      livestream,
      ".livestream-header, .livestream-project",
      "livestream-motion-ready",
      "livestream-reveal",
    );
    return;
  }

  gsap.registerPlugin(ScrollTrigger);
  livestream.classList.add("gsap-livestream-ready");
  const media = gsap.matchMedia();
  media.add(
    {
      desktop: "(min-width: 769px)",
      mobile: "(max-width: 768px)",
      reduceMotion: "(prefers-reduced-motion: reduce)",
    },
    (context) => {
      const { desktop, mobile, reduceMotion } = context.conditions;
      const heading = livestream.querySelector(".livestream-header h2");
      const allProjects = [...livestream.querySelectorAll(".livestream-project")];
      const registeredProjects = new Map();

      if (reduceMotion) {
        gsap.set([heading, ...allProjects], { clearProps: "all" });
        return undefined;
      }

      gsap.fromTo(
        heading,
        { autoAlpha: 0, yPercent: 76, skewY: 4 },
        {
          autoAlpha: 1,
          yPercent: 0,
          skewY: 0,
          duration: 0.82,
          ease: "power4.out",
          scrollTrigger: { trigger: heading, start: "top 86%", once: true },
        },
      );

      function resetLivestreamProject(project) {
        const gallery = project.querySelector(".react-circular-gallery, .depth-carousel");
        const meta = project.querySelector(".livestream-meta");
        gsap.killTweensOf([project, gallery, meta].filter(Boolean));
        gsap.set([gallery, meta].filter(Boolean), { autoAlpha: 0 });
      }

      function playLivestreamProject(project, direction, scrollDirection) {
        const gallery = project.querySelector(".react-circular-gallery, .depth-carousel");
        const meta = project.querySelector(".livestream-meta");
        const entrance = gsap.timeline({ defaults: { overwrite: "auto" } });
        gsap.killTweensOf([gallery, meta].filter(Boolean));

        if (gallery) {
          gsap.set(
            gallery,
            {
              autoAlpha: 0,
              x: direction * (mobile ? 34 : 96),
              y: scrollDirection * (mobile ? 42 : 70),
              rotationZ: direction * (mobile ? 1.8 : 4.2),
              scale: mobile ? 0.95 : 0.91,
            },
          );
          entrance.to(
            gallery,
            {
              autoAlpha: 1,
              x: 0,
              y: 0,
              rotationZ: 0,
              scale: 1,
              duration: mobile ? 0.78 : 1,
              ease: "back.out(1.4)",
            },
            0,
          );
        }
        if (meta) {
          gsap.set(meta, { autoAlpha: 0, y: scrollDirection * 26 });
          entrance.to(
            meta,
            { autoAlpha: 1, y: 0, duration: 0.54, ease: "power3.out" },
            0.42,
          );
        }
        return entrance;
      }

      const unregisterHiddenProjects = () => {
        registeredProjects.forEach((record, project) => {
          if (project.offsetParent !== null) return;
          record.entranceTrigger.kill();
          record.focusTrigger?.kill();
          const gallery = project.querySelector(".react-circular-gallery, .depth-carousel");
          const meta = project.querySelector(".livestream-meta");
          gsap.set([project, gallery, meta].filter(Boolean), { clearProps: "all" });
          registeredProjects.delete(project);
        });
      };

      const animateVisibleProjects = (revealNew = false) => {
        unregisterHiddenProjects();
        const projects = [...livestream.querySelectorAll(".livestream-project")]
          .filter((project) => project.offsetParent !== null);
        const newProjects = [];

        projects.forEach((project) => {
          if (registeredProjects.has(project)) return;
          const index = allProjects.indexOf(project);
          const direction = index % 2 === 0 ? -1 : 1;
          resetLivestreamProject(project);
          const entranceTrigger = ScrollTrigger.create({
            trigger: project,
            start: "top 88%",
            end: "bottom 12%",
            onEnter: () => playLivestreamProject(project, direction, 1),
            onEnterBack: () => playLivestreamProject(project, direction, -1),
          });

          const focusTrigger = desktop
            ? ScrollTrigger.create({
                trigger: project,
                start: "top 64%",
                end: "bottom 36%",
                onToggle: ({ isActive }) => {
                  gsap.to(project, {
                    scale: isActive ? 1.018 : 1,
                    duration: 0.52,
                    ease: isActive ? "back.out(1.35)" : "power3.out",
                    overwrite: "auto",
                  });
                },
              })
            : null;
          registeredProjects.set(project, { entranceTrigger, focusTrigger });
          newProjects.push({ project, direction });
        });

        ScrollTrigger.refresh();
        if (revealNew) {
          newProjects.forEach(({ project, direction }) => {
            const rect = project.getBoundingClientRect();
            if (rect.bottom < 0) playLivestreamProject(project, direction, -1).progress(1);
            else if (rect.top < window.innerHeight) playLivestreamProject(project, direction, 1);
          });
        }
      };

      refreshLivestreamMotion = animateVisibleProjects;
      animateVisibleProjects();
      return () => {
        refreshLivestreamMotion = () => {};
        registeredProjects.forEach(({ entranceTrigger, focusTrigger }) => {
          entranceTrigger.kill();
          focusTrigger?.kill();
        });
        registeredProjects.clear();
      };
    },
  );
}

function setupPortfolioGsapMotion() {
  setupWorksGsapMotion();
  setupLivestreamGsapMotion();
}

function setupAboutStackedEntrance() {
  const arrival = about?.querySelector("[data-about-arrival]");
  const stage = about?.querySelector("[data-about-stage]");
  const lanyardAnchor = about?.querySelector(".about-lanyard-anchor");
  const portfolio = document.querySelector("[data-about-transition-source]");
  if (!about || !arrival || !stage) return;

  const setLanyardActive = (active) => {
    stage.classList.toggle("is-lanyard-dropped", active);
    window.JOEKUNI_LIVESTREAM_REACT?.setAboutLanyardActive?.(active);
  };

  const gsap = window.gsap;
  const ScrollTrigger = window.ScrollTrigger;
  if (reducedMotion.matches) {
    stage.classList.add("is-lanyard-static");
    return;
  }

  if (window.matchMedia("(max-width: 768px)").matches) {
    if (!lanyardAnchor || !("IntersectionObserver" in window)) {
      setLanyardActive(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setLanyardActive(true);
        observer.disconnect();
      },
      { threshold: 0.28 },
    );
    observer.observe(lanyardAnchor);
    return;
  }

  if (!gsap || !ScrollTrigger || !portfolio) {
    stage.classList.add("is-lanyard-static");
    setLanyardActive(true);
    return;
  }

  gsap.registerPlugin(ScrollTrigger);
  const portfolioSurfaces = [...portfolio.querySelectorAll(".works, .livestream")];
  gsap.set(portfolioSurfaces, { transformOrigin: "50% 100%" });
  const entrance = gsap.timeline({
    scrollTrigger: {
      trigger: arrival,
      start: "top bottom",
      end: "top top",
      pin: portfolio,
      pinSpacing: false,
      scrub: 0.35,
      invalidateOnRefresh: true,
      refreshPriority: 2,
    },
  });
  entrance
    .fromTo(
      stage,
      { y: () => window.innerHeight * 0.12 },
      { y: 0, duration: 1, ease: "none" },
      0,
    )
    .to(
      portfolioSurfaces,
      { scale: 0.92, yPercent: -4, autoAlpha: 0.68, duration: 1, ease: "none" },
      0,
    );

  ScrollTrigger.create({
    trigger: arrival,
    start: "top 12%",
    end: "bottom top",
    onEnter: () => setLanyardActive(true),
    onEnterBack: () => setLanyardActive(true),
    onLeaveBack: () => setLanyardActive(false),
    refreshPriority: 3,
  });
}

function setupExperienceTimeline(timeline) {
  if (!timeline) return;

  const items = [...timeline.querySelectorAll("[data-timeline-item]")];
  if (!items.length) return;

  timeline.dataset.timelineReady = "true";

  const updateTimeline = () => {
    const rect = timeline.getBoundingClientRect();
    const progress = clamp((window.innerHeight * 0.72 - rect.top) / Math.max(rect.height, 1), 0, 1);
    timeline.style.setProperty("--timeline-progress", progress.toFixed(3));

    items.forEach((item) => {
      const itemRect = item.getBoundingClientRect();
      const revealed = itemRect.top <= window.innerHeight * 0.72;
      const active = revealed && itemRect.bottom >= window.innerHeight * 0.2;
      item.classList.toggle("is-visible", revealed || reducedMotion.matches);
      item.classList.toggle("is-active", active || reducedMotion.matches);
    });
  };

  if (reducedMotion.matches) {
    updateTimeline();
    return;
  }

  let frame = 0;
  const requestUpdate = () => {
    if (frame) return;
    frame = window.requestAnimationFrame(() => {
      frame = 0;
      updateTimeline();
    });
  };

  window.addEventListener("scroll", requestUpdate, { passive: true });
  window.addEventListener("resize", requestUpdate);
  updateTimeline();
}

setupAboutStackedEntrance();
setupSectionMotion(about?.querySelector(".about-experience"), ".about-reveal", "about-motion-ready");
setupSectionMotion(contact, ".contact-ending", "contact-motion-ready", "contact-reveal");
setupExperienceTimeline(about?.querySelector("[data-experience-timeline]"));

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

videos.forEach((video) => {
  const panel = video.closest(".media-panel");
  const button = panel.querySelector("[data-video-toggle]");

  if (button) {
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
  }

  video.addEventListener("play", () => {
    pauseOtherVideos(video);
    showAutoplayNote(video, false);
    if (button) setToggleState(video, button);
  });
  video.addEventListener("playing", () => panel.classList.add("has-video-frame"));
  video.addEventListener("pause", () => {
    if (button) setToggleState(video, button);
  });
  video.addEventListener("emptied", () => panel.classList.remove("has-video-frame"));
  video.addEventListener("error", () => {
    panel.classList.remove("has-video-frame");
    showAutoplayNote(video, true);
  });
  if (button) setToggleState(video, button);
});

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function smoothstep(start, end, value) {
  const progress = clamp((value - start) / (end - start), 0, 1);
  return progress * progress * (3 - 2 * progress);
}

function revealCopy(copy, progress) {
  if (!copy) return;
  const visibleProgress = reducedMotion.matches ? 1 : clamp(progress, 0, 1);
  copy.style.setProperty("--copy-reveal-bottom", `${((1 - visibleProgress) * 100).toFixed(3)}%`);
  copy.style.setProperty("--copy-reveal-opacity", smoothstep(0, 0.22, visibleProgress).toFixed(4));
}

function setActiveScene(index) {
  const nextIndex = Number.isInteger(index) ? index : -1;

  if (activeSceneIndex !== nextIndex) {
    activeSceneIndex = nextIndex;

    scenes.forEach((scene, sceneIndex) => {
      const video = scene.querySelector("video");
      const button = scene.querySelector("[data-video-toggle]");
      const isActive = sceneIndex === activeSceneIndex;

      scene.classList.toggle("is-active", isActive);
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
  if (!sequence || !introStage || scenes.length < 2) return;

  const viewportHeight = introStage.offsetHeight || window.innerHeight;
  const scrollDistance = Math.max(sequence.offsetHeight - viewportHeight, 1);
  const heroFrameEnd = Math.min(scrollDistance, Math.max(viewportHeight * 0.3, 1));
  const heroTextStart = heroFrameEnd;
  const heroTextEnd = Math.max(heroTextStart + 1, scrollDistance * 0.34);
  const heroTextHoldDistance = Math.min(
    Math.max(viewportHeight * 0.22, 160),
    Math.max(scrollDistance - heroTextEnd - 1, 160),
  );
  const heroTextHoldEnd = Math.min(scrollDistance, heroTextEnd + heroTextHoldDistance);
  const flipStart = heroTextHoldEnd;
  const flipEnd = Math.max(flipStart + 1, scrollDistance * 0.72);
  const statementTextStart = flipEnd;
  const statementTextEnd = Math.max(statementTextStart + 1, scrollDistance * 0.9);

  introMetrics = {
    viewportHeight,
    sequenceHeight: sequence.offsetHeight,
    scrollDistance,
    heroFrameEnd,
    heroTextStart,
    heroTextEnd,
    heroTextHoldEnd,
    heroTextHoldDistance,
    flipStart,
    flipEnd,
    statementTextStart,
    statementTextEnd,
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

function setupIntroGsapFlip() {
  const gsap = window.gsap;
  if (!sequence || !gsap) return;
  const flipAngleProperty = mobileIntroFlip.matches
    ? "--intro-flip-angle-y"
    : "--intro-flip-angle-x";

  introFlipTimeline?.kill();
  sequence.style.setProperty("--intro-flip-angle-x", "0deg");
  sequence.style.setProperty("--intro-flip-angle-y", "0deg");
  introFlipTimeline = gsap.timeline({ paused: true, defaults: { ease: "none" } });
  introFlipTimeline
    .to(
      sequence,
      {
        "--intro-card-scale": 0.965,
        "--intro-card-depth": "-24px",
        duration: 0.16,
        ease: "power2.in",
      },
      0,
    )
    .to(
      sequence,
      {
        [flipAngleProperty]: "90deg",
        "--intro-card-scale": 0.93,
        "--intro-card-depth": "-64px",
        "--intro-edge-highlight-opacity": 0.32,
        duration: 0.38,
        ease: "power1.inOut",
      },
      0.16,
    )
    .to(
      sequence,
      {
        [flipAngleProperty]: "184deg",
        "--intro-card-scale": 1.006,
        "--intro-card-depth": "4px",
        "--intro-edge-highlight-opacity": 0,
        duration: 0.38,
        ease: "power1.inOut",
      },
      0.54,
    )
    .to(
      sequence,
      {
        [flipAngleProperty]: "180deg",
        "--intro-card-scale": 1,
        "--intro-card-depth": "0px",
        duration: 0.08,
        ease: "power2.out",
      },
      0.92,
    );
}

function updateDisplayedIntroFlip(timestamp) {
  const continuousTarget = smoothstep(0, 1, introRawFlipProgress);
  const target = reducedMotion.matches
    ? Number(introRawFlipProgress >= 0.5)
    : introSnapSide ?? continuousTarget;

  if (introRawFlipProgress <= 0) {
    introDisplayedFlipProgress = 0;
  } else if (introRawFlipProgress >= 1) {
    introDisplayedFlipProgress = 1;
  } else {
    const elapsed = introLastFrameTime ? Math.min(timestamp - introLastFrameTime, 48) : 16;
    const response = introSnapSide === null ? 70 : 95;
    const attraction = 1 - Math.exp(-elapsed / response);
    introDisplayedFlipProgress += (target - introDisplayedFlipProgress) * attraction;
    if (Math.abs(target - introDisplayedFlipProgress) < 0.0005) {
      introDisplayedFlipProgress = target;
    }
  }

  introLastFrameTime = timestamp;
  return introDisplayedFlipProgress;
}

function getIntroSnapSide(progress) {
  if (progress <= 0.18) return 0;
  if (progress >= 0.82) return 1;
  return null;
}

function handleIntroScroll() {
  const direction = Math.sign(window.scrollY - introLastScrollY);
  introLastScrollY = window.scrollY;

  if (
    (introSnapSide === 0 && direction > 0) ||
    (introSnapSide === 1 && direction < 0)
  ) {
    introSnapSide = null;
  }

  window.clearTimeout(introScrollSettleTimer);
  introScrollSettleTimer = window.setTimeout(() => {
    introSnapSide = getIntroSnapSide(introRawFlipProgress);
    requestFrameUpdate();
  }, 120);
  requestFrameUpdate();
}

window.addEventListener("scroll", handleIntroScroll, { passive: true });

function updateIntroSequence(timestamp = performance.now()) {
  if (!sequence || !introMetrics) return;

  const rect = sequence.getBoundingClientRect();
  const distance = clamp(-rect.top, 0, introMetrics.scrollDistance);
  updateHeroSurfaceProgress(distance);
  const sequenceVisible = rect.bottom > 0 && rect.top < window.innerHeight;
  const targetFirstReveal = clamp(
    (distance - introMetrics.heroTextStart) /
      Math.max(introMetrics.heroTextEnd - introMetrics.heroTextStart, 1),
    0,
    1,
  );
  const displayedHeroTextProgress = reducedMotion.matches
    ? targetFirstReveal
    : smoothstep(0, 1, targetFirstReveal);
  introDisplayedHeroTextProgress = displayedHeroTextProgress;
  const heroTextReady = distance >= introMetrics.heroTextHoldEnd;

  introRawFlipProgress = heroTextReady
    ? clamp(
        (distance - introMetrics.flipStart) /
          Math.max(introMetrics.flipEnd - introMetrics.flipStart, 1),
        0,
        1,
      )
    : 0;
  const displayedFlipProgress = updateDisplayedIntroFlip(timestamp);
  const secondReveal = clamp(
    (distance - introMetrics.statementTextStart) /
      Math.max(introMetrics.statementTextEnd - introMetrics.statementTextStart, 1),
    0,
    1,
  );

  sequence.style.setProperty("--intro-flip-progress", displayedFlipProgress.toFixed(4));
  if (reducedMotion.matches || !introFlipTimeline) {
    const angle = `${(displayedFlipProgress * 180).toFixed(3)}deg`;
    sequence.style.setProperty("--intro-flip-angle-x", mobileIntroFlip.matches ? "0deg" : angle);
    sequence.style.setProperty("--intro-flip-angle-y", mobileIntroFlip.matches ? angle : "0deg");
    sequence.style.setProperty("--intro-card-depth", "0px");
    sequence.style.setProperty("--intro-card-scale", "1");
    sequence.style.setProperty("--intro-edge-highlight-opacity", "0");
  } else {
    introFlipTimeline.progress(displayedFlipProgress);
  }

  const faceDirection = Math.cos(Math.PI * displayedFlipProgress);
  const heroFaceOpacity = smoothstep(0.04, 0.18, faceDirection);
  const statementFaceOpacity = smoothstep(0.04, 0.18, -faceDirection);

  sequence.style.setProperty("--hero-face-opacity", heroFaceOpacity.toFixed(4));
  sequence.style.setProperty("--statement-face-opacity", statementFaceOpacity.toFixed(4));

  const secondVideo = scenes[1]?.querySelector("video");

  if (
    secondVideo &&
    introRawFlipProgress > 0.15 &&
    siteLoaderReady &&
    !dataSaverEnabled() &&
    !reducedMotion.matches
  ) {
    loadDeferredVideo(secondVideo);
  }

  const nextActiveScene = sequenceVisible ? Number(displayedFlipProgress >= 0.5) : -1;
  setActiveScene(nextActiveScene);

  revealCopy(copies[0], displayedHeroTextProgress);
  revealCopy(copies[1], secondReveal);
}

function updateFrame(timestamp) {
  animationFrameRequested = false;
  updateIntroSequence(timestamp);
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
Promise.allSettled([tvcHydrationPromise, livestreamHydrationPromise]).then(() => {
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(setupPortfolioGsapMotion);
  });
});
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
  setupIntroGsapFlip();
  requestFrameUpdate();
});

window.addEventListener("orientationchange", () => {
  measureIntroSequence();
  setupIntroGsapFlip();
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
setupIntroGsapFlip();
requestFrameUpdate();

window.addEventListener("load", () => {
  measureIntroSequence();
  requestFrameUpdate();
});
