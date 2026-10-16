export interface VaultFile {
  path: string;
  name: string;
  extension: string;
  is_dir: boolean;
  parent: string;
  mtime?: number;
}

export interface FileNode {
  path: string;
  name: string;
  extension: string;
  is_dir: boolean;
  children: FileNode[];
}
