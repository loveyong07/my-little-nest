export function retainedPostIndex(previousPosts, previousIndex, nextPosts) {
  const currentId = previousPosts[previousIndex]?.id;
  if (!currentId) return 0;
  const index = nextPosts.findIndex((post) => post.id === currentId);
  return index < 0 ? 0 : index;
}
