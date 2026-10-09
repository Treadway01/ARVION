import Constants from 'expo-constants';

const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, string | undefined>;

export const env = {
  solanaCluster: (extra.solanaCluster ?? 'devnet') as 'devnet' | 'mainnet-beta',
  solanaRpcUrl: extra.solanaRpcUrl,
  apiBaseUrl: extra.apiBaseUrl,
  sgtRpcUrl: extra.sgtRpcUrl ?? 'https://api.mainnet-beta.solana.com',
  // Official SKR mint from solanamobile.com/skr. Override only to test with a devnet token.
  skrMint: extra.skrMint ?? 'SKRbvo6Gf7GondiT3BbTfuRDPqLWei4j2Qy2NPGZhW3',
  paymentCluster: (extra.paymentCluster ?? 'mainnet-beta') as 'devnet' | 'mainnet-beta',
  paymentRpcUrl: extra.paymentRpcUrl ?? extra.sgtRpcUrl ?? 'https://api.mainnet-beta.solana.com',
};