export interface ConnectorStorage {
  exists(path: string): Promise<boolean>;
  read(path: string): Promise<any>;
}
