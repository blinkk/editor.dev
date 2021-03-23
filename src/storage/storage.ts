import path from 'path';
import {GenericApiError} from '../api/api';

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface ConnectorApiComponent {}

export interface ConnectorStorageComponent {
  root: string;
  deleteFile(path: string): Promise<void>;
  existsFile(path: string): Promise<boolean>;
  readDir(path: string): Promise<Array<any>>;
  readFile(path: string): Promise<any>;
  writeFile(path: string, content: string): Promise<void>;
}

export interface ConnectorApiStorageComponent
  extends ConnectorStorageComponent {
  api: ConnectorApiComponent;
}

export interface ConnectorStorageConstructor {
  new (
    root: string,
    api?: ConnectorApiComponent,
    meta?: Record<string, any>
  ): ConnectorStorageComponent;
}

export interface StorageManagerConfig {
  rootDir: string;
  storageCls: ConnectorStorageConstructor;
}

export class StorageManager {
  config: StorageManagerConfig;

  constructor(config: StorageManagerConfig) {
    this.config = config;
  }

  storageForBranch(
    organization: string,
    project: string,
    branch: string,
    api?: ConnectorApiComponent,
    meta?: Record<string, any>
  ): ConnectorStorageComponent {
    organization = cleanDirectory(organization);
    project = cleanDirectory(project);
    branch = cleanDirectory(branch);
    const branchPath = `${organization}/${project}/${branch}/`;
    const fullPath = path.join(this.config.rootDir, branchPath);
    return new this.config.storageCls(fullPath, api, meta);
  }
}

function cleanDirectory(dirName: string): string {
  // TODO: More security around valid directory names.

  // Disallow slashes in a directory name.
  if (dirName.search(/[/\\]/) >= 0) {
    throw new Error(`Unable to have directory name with slashes: ${dirName}`);
  }

  return dirName;
}

export function expandPath(root: string, filePath: string): string {
  // TODO: More security around file access?
  filePath = path.join(root, filePath);
  const fullPath = path.resolve(filePath);

  if (!fullPath.startsWith(root)) {
    throw new Error(
      `Cannot work with files outside of '${root}'. '${filePath}' resolved to '${fullPath}'`
    );
  }

  return fullPath;
}

/**
 * Normalized error for missing files in the storage classes.
 */
export class FileNotFoundError extends GenericApiError {}
