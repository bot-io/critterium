import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.critterium.app',
  appName: 'Critterium',
  webDir: 'packages/app/dist',
  server: {
    androidScheme: 'https'
  },
  android: {
    backgroundColor: '#000000',
  }
};

export default config;
