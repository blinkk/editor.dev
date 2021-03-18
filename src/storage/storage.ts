import path from 'path';

export interface ConnectorStorage {
  root: string;
  deleteFile(path: string): Promise<void>;
  existsFile(path: string): Promise<boolean>;
  readDir(path: string): Promise<Array<any>>;
  readFile(path: string): Promise<any>;
  writeFile(path: string, content: string): Promise<void>;
}

export interface ConnectorStorageConstructor {
  new (root?: string): ConnectorStorage;
}

export interface StorageManagerDevConfig {
  useSingleDirectory?: boolean;
}

export interface StorageManagerConfig {
  dev?: StorageManagerDevConfig;
  rootDir: string;
  storageCls: ConnectorStorageConstructor;
}

export class StorageManager {
  config: StorageManagerConfig;
  storages: Record<string, ConnectorStorage>;

  constructor(config: StorageManagerConfig) {
    this.config = config;
    this.storages = {};
  }

  storageForBranch(
    organization: string,
    project: string,
    branch: string
  ): ConnectorStorage {
    const branchPath = `${cleanDirectory(organization)}/${cleanDirectory(
      project
    )}/${cleanDirectory(branch)}/`;
    let fullPath = path.join(this.config.rootDir, branchPath);

    // When developing, all branches should be the same local directory.
    if (this.config.dev?.useSingleDirectory) {
      fullPath = this.config.rootDir;
    }

    if (!this.storages[branchPath]) {
      this.storages[branchPath] = new this.config.storageCls(fullPath);
    }
    return this.storages[branchPath];
  }
}

function cleanDirectory(dirName: string): string {
  // TODO: More security around valid directory names.

  // Disallow all slashes from directory name.
  if (dirName.search(/[\/\\]/) >= 0) {
    throw new Error(`Unable to have directory name with slashes: ${dirName}`);
  }

  return dirName;
}
