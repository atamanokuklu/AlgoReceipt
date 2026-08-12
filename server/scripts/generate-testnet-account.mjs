#!/usr/bin/env node
// Generates a fresh Algorand account (address + 25-word mnemonic) for use as a persistent
// TestNet merchant treasury or demo agent. Run with:
//   node scripts/generate-testnet-account.mjs
//
// Fund the printed address with TestNet ALGO from https://bank.testnet.algorand.network/,
// then paste the mnemonic into server/.env as MERCHANT_MNEMONIC or AGENT_MNEMONIC.
import algosdk from 'algosdk';

const account = algosdk.generateAccount();
const mnemonic = algosdk.secretKeyToMnemonic(account.sk);

console.log('Address :', account.addr.toString());
console.log('Mnemonic:', mnemonic);
console.log('\nNext steps:');
console.log('1. Fund this address with TestNet ALGO: https://bank.testnet.algorand.network/');
console.log('2. Add the mnemonic to server/.env as MERCHANT_MNEMONIC or AGENT_MNEMONIC.');
console.log('3. Set ALGO_NETWORK=testnet in server/.env and restart the server.');
