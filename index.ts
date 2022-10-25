import { clusterApiUrl, Connection, PublicKey, Struct } from '@solana/web3.js';
import { AccountLayout, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { connect } from 'mongoose';
import { serialize, deserialize, deserializeUnchecked } from "borsh";
import { Buffer } from "buffer";
import { processMETrans } from './solana/magiceden';
import { processSolanartTrans } from './solana/solanart';
import { processHyperSpaceTrans } from './solana/hyperspace';

const RPC_HTTPS = 'https://api.mainnet-beta.solana.com/';
const RPC_WS = 'ws://api.mainnet-beta.solana.com/';
const MONGODB_CONNECTION_STRING = 'mongodb://localhost:27017/test';

const ME_PUBLIC_KEY = 'M2mx93ekt1fmXSVkTrUL9xVFHkmME8HTUi5Cyc5aF7K';
const SOLANART_PUBLIC_KEY = 'CJsLwbP1iu5DuUikHEJnLfANgKy6stB2uFgvBBHoyxwz';
const HYPERSPACE_PUBLIC_KEY = 'HYPERfwdTjyJ2SCaKHmpF2MtrXqWxrsotYDsTrshHWq8';

const connection = new Connection(RPC_HTTPS, {
  commitment: 'confirmed',
  wsEndpoint: RPC_WS
});

console.log('Server started');

(async () => {
  await connect(MONGODB_CONNECTION_STRING);

  // Register a callback to listen to the wallet (ws subscription)
  try {
    connection.onLogs(
      new PublicKey(ME_PUBLIC_KEY),
      (logSubscribe) => processMETrans(connection, logSubscribe),
      'confirmed',
    );

    connection.onLogs(
      new PublicKey(SOLANART_PUBLIC_KEY),
      (logSubscribe) => processSolanartTrans(connection, logSubscribe?.signature),
      'confirmed',
    );

    connection.onLogs(
      new PublicKey(HYPERSPACE_PUBLIC_KEY),
      (logSubscribe) => processHyperSpaceTrans(connection, logSubscribe?.signature),
      'confirmed',
    )
  } catch(err) {
    console.log({ err });
    process.exit(0);
  }
})();

// TODO delete
// processHyperSpaceTrans(
//   '2WnXF2hjFhG9SYd5BiGWWCtPzpiPEkgrmKDXptmRrZgrEH6JQJvLqF4CPTyBZ4PgSRJsK7big99vN6ytDzzzfvFG'
// );

// (async () => {
//   console.log(clusterApiUrl('mainnet-beta'))
//   const tokenAccounts = await new Connection(clusterApiUrl('devnet'), 'confirmed').getTokenAccountsByOwner(
//     new PublicKey('8YLKoCu7NwqHNS8GzuvA2ibsvLrsg22YMfMDafxh1B15'),
//     {
//       programId: TOKEN_PROGRAM_ID,
//     }
//   );
//   console.log("Token                                         Balance");
//   tokenAccounts.value.forEach((tokenAccount) => {
//     const accountData = AccountLayout.decode(tokenAccount.account.data);
//     console.log(`${new PublicKey(accountData.mint)}   ${accountData.amount}`);
//   })
// })();

// class Primitive extends Struct {
//   constructor(properties: any) {
//     super(properties);
//   }
// }

// // Borsh needs a schema describing the payload
// const schema = new Map([
//   [
//     Primitive,
//     {
//       kind: "struct",
//       fields: [
//         ["lamports", "u64"],
//       ],
//     },
//   ],
// ]);
// const value = new Primitive({
//   lamports: 4500000000,
// });

// console.log("Value = ", value);
// // Serialize then deserialize
// const dser = Buffer.from(serialize(schema, value));
// console.log(dser); // 3Bxs3zx1e93Wv72P
// const newValue = deserialize(schema, Primitive, dser);
// // Viola!
// console.log("New value = ", newValue);
// // console.log(deserializeUnchecked(payloadSchema, Payload, '3Bxs4TfyrRxcATJ7'));
