import { ExpoConfig } from 'expo/config';

const APP_NAME = 'ARVION';
const PACKAGE_NAME = 'com.treadway01.arvion';

const config: ExpoConfig = {
  name: APP_NAME,
  slug: 'arvion',
  scheme: 'arvion',
  version: '1.0.0',
  orientation: 'portrait',
  userInterfaceStyle: 'dark',
  icon: './assets/arvion/icon.png',
  android: {
    package: PACKAGE_NAME,
    adaptiveIcon: {
      foregroundImage: './assets/arvion/adaptive-foreground.png',
      monochromeImage: './assets/arvion/adaptive-monochrome.png',
      backgroundColor: '#05060B',
    },
  },
  plugins: [
    'expo-router',
    'expo-dev-client',
    ['expo-image-picker', { cameraPermission: 'Allow $(PRODUCT_NAME) to use the camera to capture your assets.' }],
    ['expo-splash-screen', { image: './assets/arvion/splash.png', imageWidth: 220, backgroundColor: '#05060B' }],
  ],
  extra: {
    solanaCluster: process.env.SOLANA_CLUSTER,
    solanaRpcUrl: process.env.SOLANA_RPC_URL,
    apiBaseUrl: process.env.API_BASE_URL,
    sgtRpcUrl: process.env.SGT_RPC_URL,
    skrMint: process.env.SKR_MINT,
    paymentCluster: process.env.PAYMENT_CLUSTER,
    paymentRpcUrl: process.env.PAYMENT_RPC_URL,
  },
};

export default config;
