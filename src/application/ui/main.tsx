import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
import '@fontsource/nunito-sans/400.css';
import '@fontsource/nunito-sans/600.css';
import '@fontsource/museomoderno/600.css';
import './theme/global.css';

import {createRoot} from 'react-dom/client';

import {App} from './app';
import {applyTheme} from './theme/theme';

applyTheme('dark', document.documentElement);
createRoot(document.getElementById('root')!).render(<App />);
