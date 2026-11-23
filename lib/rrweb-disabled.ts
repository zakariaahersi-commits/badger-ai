// Layers declares rrweb as optional but its bundle contains a dynamic import
// that Webpack resolves eagerly. Badger does not enable session replay.
export function record(): () => void {
  return () => {};
}
