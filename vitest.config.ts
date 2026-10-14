import { defineConfig } from 'vitest/config';
import { vitestTermcore } from 'termcore/build';

export default defineConfig({ ...vitestTermcore() });
