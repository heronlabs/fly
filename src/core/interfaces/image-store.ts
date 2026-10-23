export abstract class ImageStore {
  // Writes a new file outside every worktree and resolves its absolute path.
  abstract savePng(png: Uint8Array): Promise<string>;
}
