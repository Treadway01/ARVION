import { openDb } from './db';
import { DEFAULT_SKR_MINT, buildApp } from './app';
import { makeHolderOf, makePaymentTx } from './solana';

const db = openDb(process.env.DB_PATH ?? './data/app.db');
const app = buildApp(db, {
  holderOf: makeHolderOf(process.env.SOLANA_RPC_URL ?? 'https://api.devnet.solana.com'),
  skrMint: process.env.SKR_MINT ?? DEFAULT_SKR_MINT,
  paymentTx: makePaymentTx(process.env.PAYMENT_RPC_URL ?? 'https://api.mainnet-beta.solana.com'),
});
const port = Number(process.env.PORT ?? 8787);

app.listen({ port, host: '0.0.0.0' }).then(() => {
  console.log(`API listening on :${port}`);
});