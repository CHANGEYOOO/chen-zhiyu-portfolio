import { createRoot } from "react-dom/client";
import CircularGallery from "./CircularGallery.jsx";
import Lanyard from "./Lanyard.jsx";
import StrokeText from "./StrokeText.jsx";
import { buildCarouselItems } from "./model.mjs";
import "./styles.css";

function LivestreamCarousels({ projects, imageDimensions }) {
  return projects.map((project) => (
    <article className="livestream-project livestream-react-project" data-livestream-project={project.id} key={project.id}>
      <CircularGallery
        items={buildCarouselItems(project, imageDimensions)}
        label={`${project.title}图片，共 ${project.images.length} 张`}
      />
      <div className="livestream-meta">
        <h3>{project.title}</h3>
        <p>{project.category}</p>
      </div>
    </article>
  ));
}

let livestreamRoot;
let aboutLanyardRoot;
const headingRoots = new Map();

window.JOEKUNI_LIVESTREAM_REACT = {
  mount(container, projects, imageDimensions) {
    livestreamRoot?.unmount();
    livestreamRoot = createRoot(container);
    livestreamRoot.render(<LivestreamCarousels projects={projects} imageDimensions={imageDimensions} />);
    return true;
  },
  mountStrokeHeadings(nodes) {
    [...nodes].forEach((node) => {
      if (headingRoots.has(node)) return;
      const text = node.textContent.trim();
      const headingRoot = createRoot(node);
      headingRoots.set(node, headingRoot);
      headingRoot.render(
        <StrokeText
          text={text}
          trigger="scroll"
          strokeColor="rgba(0, 0, 0, 0.34)"
          fillColor="#000"
          className="section-stroke-text"
        />,
      );
    });
    return true;
  },
  mountAboutLanyard(container, frontImage) {
    if (!container) return false;
    const probe = document.createElement("canvas");
    const hasWebGL = Boolean(probe.getContext("webgl2") || probe.getContext("webgl"));
    if (!hasWebGL) return false;
    aboutLanyardRoot?.unmount();
    const portrait = container.closest(".about-portrait");
    portrait?.classList.remove("is-lanyard-ready");
    aboutLanyardRoot = createRoot(container);
    aboutLanyardRoot.render(
      <Lanyard
        frontImage={frontImage}
        backImage={frontImage}
        cameraDistance={22}
        onReady={() => portrait?.classList.add("is-lanyard-ready")}
      />,
    );
    return true;
  },
};
