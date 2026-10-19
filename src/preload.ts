import {contextBridge} from 'electron';

import {channels} from './core/domain/fly-api';

void channels;
contextBridge.exposeInMainWorld('fly', {});
