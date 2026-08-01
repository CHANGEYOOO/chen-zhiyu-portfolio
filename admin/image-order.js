export async function saveImageOrder(api, workId, sortableList) {
  const orderedImages = sortableList.items;
  await api.saveImageOrder(workId, orderedImages.map((image) => image.id));
  sortableList.commit();
  return sortableList.items;
}
