export async function saveImageOrder(api, workId, sortableList) {
  const orderedImages = sortableList.items;
  sortableList.setDisabled(true);
  try {
    await api.saveImageOrder(workId, orderedImages.map((image) => image.id));
    sortableList.commit();
    return sortableList.items;
  } finally {
    sortableList.setDisabled(false);
  }
}
