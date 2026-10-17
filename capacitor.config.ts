import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.brickbreaker.infinite',
  appName: 'Brick Breaker Infinite',
  webDir: 'dist',
  android: {
    backgroundColor: '#05010f',
    allowMixedContent: false,
    captureInput: false,
    webContentsDebuggingEnabled: false,
  },
  plugins: {
    SystemBars: {
      // Inject --safe-area-inset-* CSS variables so the layout can avoid cutouts and system bars.
      insetsHandling: 'css',
      initialViewportFitValueHint: 'cover',
      style: 'DARK',
    },
  },
};

export default config;
