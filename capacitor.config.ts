import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.tuxi.marketplace.app',
  appName: 'TUXI Global Hub',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  }
};

export default config;
