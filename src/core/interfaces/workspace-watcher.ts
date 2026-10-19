export abstract class WorkspaceWatcher {
  abstract watch(repoPaths: string[], onChange: () => void): () => void; // returns dispose
}
