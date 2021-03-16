import {ConnectorStorage} from './storage';
import {LocalStorage} from './local';

/**
 * Github storage uses a local cache for the files.
 * Pulls from the github service when the cache is out of date.
 */
export class GithubStorage extends LocalStorage implements ConnectorStorage {}
