/**
 * Side-effect module: import FIRST from the mock entry point so the mock storage namespace
 * is active before any other module (or the app) reads localStorage.
 */
import { enableMockMode } from './storageKeys';

enableMockMode();
