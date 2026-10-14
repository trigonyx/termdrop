import pkg from '../package.json';
import { defineApp } from 'termcore/app/suite';

/** termdrop as termcore sees it: name, protocol `termdrop/1`, ports 5054/5055, `TERMDROP_*`, repo, version. */
export const APP = defineApp('termdrop', pkg);
