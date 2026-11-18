export function retainedPostIndex(previousPosts, previousIndex, nextPosts) {
  return Math.max(0, restoreReadingIndex(nextPosts, previousPosts[previousIndex]?.id));
}

export function restoreReadingIndex(items, id, key = "id") {
  return id ? items.findIndex((item) => item[key] === id) : -1;
}
