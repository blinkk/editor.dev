export interface ConnectorStorage {
  delete(path: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  read(path: string): Promise<any>;
  write(path: string, content: string): Promise<void>;
}
