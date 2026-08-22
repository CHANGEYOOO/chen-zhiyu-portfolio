const mediaBase = "https://media.kjoe.top/media-v0.21/assets/images/livestream";

export function countLivestreamImages(projects) {
  return projects.reduce((total, project) => total + project.images.length, 0);
}

export function buildCarouselItems(project, imageDimensions) {
  return project.images.map((image, index) => {
    const filename = typeof image === "string" ? image : image.name;
    const url = typeof image === "object" && typeof image.url === "string"
      ? image.url
      : `${mediaBase}/${project.directory}/${filename}`;
    const dimensions = typeof image === "object" && Array.isArray(image.dimensions)
      ? image.dimensions
      : imageDimensions[`${project.directory}/${filename}`];

    if (!Array.isArray(dimensions) || dimensions.length !== 2) {
      throw new Error(`Invalid livestream image dimensions: ${project.title}`);
    }

    return {
      image: url,
      alt: `${project.title} 第 ${String(index + 1).padStart(2, "0")} 张图片`,
      dimensions,
      aspectRatio: dimensions[0] / dimensions[1],
    };
  });
}
