import { createRoot } from "react-dom/client";
import CircularGallery from "./CircularGallery.jsx";
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

let root;

window.JOEKUNI_LIVESTREAM_REACT = {
  mount(container, projects, imageDimensions) {
    root?.unmount();
    root = createRoot(container);
    root.render(<LivestreamCarousels projects={projects} imageDimensions={imageDimensions} />);
    return true;
  },
};
