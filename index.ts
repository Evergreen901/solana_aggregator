import { createServer } from 'http';
import WebSocket, { Server } from 'ws';
import { Connection, PublicKey } from '@solana/web3.js';
import { Schema, model, connect } from 'mongoose';
// TODO delete
// import GlobalOffers from './solanart/idl/global_offers.json';
// import * as anchor from '@project-serum/anchor';
// import { BorshCoder, EventParser, Program, web3 } from "@project-serum/anchor";
// import { Tcf } from "../target/types/tcf";

const RPC_HTTPS = 'https://api.mainnet-beta.solana.com/';
const RPC_WS = 'wss://api.mainnet-beta.solana.com/';
const LAMPORTS_PER_SOL = 1e9;
const MONGODB_CONNECTION_STRING = 'mongodb://localhost:27017/test';

const ME_PUBLIC_KEY = 'M2mx93ekt1fmXSVkTrUL9xVFHkmME8HTUi5Cyc5aF7K';
const SOLANART_PUBLIC_KEY = 'CJsLwbP1iu5DuUikHEJnLfANgKy6stB2uFgvBBHoyxwz';

// websocket stuff
interface ExtWebSocket extends WebSocket {
  isAlive: boolean;
}

interface TransData {
  marketplace: string,
  signature: string;
  instruction: string;
  data: any;
}

// TODO delete
// anchor.setProvider(anchor.AnchorProvider.env());
// const program = anchor.workspace.CoinFlip as Program<GlobalOffers>;
// const coder = new BorshCoder(GlobalOffers);

const dataSchema = new Schema<TransData>({
  marketplace: { type: String, required: true },
  signature: { type: String, required: true },
  instruction: { type: String, required: true },
  data: { type: Array }
});

const DataModel = model<TransData>('transactions', dataSchema);

const server = createServer();

const wss = new Server({ server });

const delay = (milliseconds: number) => {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
};

wss.on('connection', (ws: ExtWebSocket) => {
  ws.isAlive = true;
});

const interval = setInterval(function ping() {
  wss.clients.forEach((ws: WebSocket) => {
    const extWs = ws as ExtWebSocket;
    if (extWs.isAlive === false) return ws.terminate();

    extWs.isAlive = false;
    ws.ping();
  });
}, 30000);

wss.on('close', function close() {
  clearInterval(interval);
});

server.listen(3337);

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
      (logSubscribe) => processMETrans(logSubscribe),
      'confirmed',
    );

    connection.onLogs(
      new PublicKey(SOLANART_PUBLIC_KEY),
      (logSubscribe) => processSolanartTrans(logSubscribe?.signature),
      'confirmed',
    );
  } catch {
    console.log('ERR IN async');
    process.exit(0);
  }
})();

const getTransaction = async (signature: any) => {
  try {
    let transData;
    let tries = 0;

    while (!transData && tries < 4) {
      transData = await connection.getTransaction(signature, {
        commitment: 'confirmed'
      });
      tries += 1;
      await delay(30);
    }

    if (signature !== transData?.transaction?.signatures?.[0] ?? '') {
      console.error(
        `Signature mismatched: ${signature}, ${transData?.transaction?.signatures?.[0]}`
      );
    }

    return transData;
  } catch (err) {
    console.log({ err_from_signatureGetter: err, signature });

    return null;
  }
};

const processMETrans = async (logData: any) => {
  try {
    const transData = await getTransaction(logData.signature);
    if (transData == null) {
      console.error('transData is null');
      return;
    }

    if (
      // Listing
      logData.logs.includes('Program log: Instruction: Sell') &&
      logData.logs.includes(`Program ${ME_PUBLIC_KEY} success`)
    ) {
      parseMELog(logData, logData.signature, transData, 'Listing');
    } else if (
      // Sale
      logData.logs.includes('Program log: Instruction: Deposit') &&
      logData.logs.includes('Program log: Instruction: Buy') &&
      logData.logs.includes('Program log: Instruction: ExecuteSale') &&
      logData.logs.includes(`Program ${ME_PUBLIC_KEY} success`)
    ) {
      parseMELog(logData, logData.signature, transData, 'Sale');
    } else if (
      // Place Bid
      logData.logs.includes('Program log: Instruction: Buy') &&
      logData.logs.includes(`Program ${ME_PUBLIC_KEY} success`)
    ) {
      parseMELog(logData, logData.signature, transData, 'Place Bid');
    } else if (
      // Cancel Listing
      logData.logs.includes('Program log: Instruction: CancelSell') &&
      logData.logs.includes('Program log: Instruction: SetAuthority') &&
      logData.logs.includes(`Program ${ME_PUBLIC_KEY} success`)
    ) {
      parseMELog(logData, logData.signature, transData, 'Cancel Listing');
    } else if (
      // Cancel Bid
      logData.logs.includes('Program log: Instruction: CancelBuy') &&
      logData.logs.includes(`Program ${ME_PUBLIC_KEY} success`)
    ) {
      parseMELog(logData, logData.signature, transData, 'Cancel Bid');
    } else {
      console.log(
        '-------------------------- Unknown transaction type (MagicEden) ----------------------------'
      );
      console.log({ signature: logData.signature });
      for (const log of logData.logs) {
        if (log.startsWith('Program log: Instruction: ')) {
          console.log(log);
        }
      }
    }
  } catch (err) {
    console.log('Error in processMETrans: \n', err);
  }
};

const parseMELog = async (logData: any, sign: any, transData: any, type: string) => {
  try {
    let MEData: any = [];

    try {
      if (type == 'Listing') {
        MEData = parseMEListing(logData, transData);
      } else if (type == 'Sale') {
        MEData = parseMESale(logData, transData);
      } else if (type == 'Place Bid') {
        MEData = parseMEPlaceBid(logData, transData);
      } else if (type == 'Cancel Listing') {
        MEData = parseMECancelListing(logData, transData);
      } else if (type == 'Cancel Bid') {
        MEData = parseMECancelBid(logData, transData);
      }
    } catch (err) {
      MEData = [];
      console.log('Error in parse ME log');
    }

    console.log(`-------------------- MagicEden - ${type} --------------------`);
    console.log({ LogData: logData.signature });
    console.log({ MEData });

    const newDocument = await DataModel.create({
      marketplace: 'MagicEden',
      signature: logData.signature,
      instruction: type,
      data: MEData
    });

    console.log({ Saved: newDocument._id.toString() });
  } catch (err) {
    console.log({ 'Error in parseMELog': err });
  }
};

const parseMEListing = (logData: any, transData: any) => {
  for (const element of logData.logs) {
    if (element.includes('Program log: {"price":')) {
      const parsedDict = JSON.parse(element.split('Program log: ')[1]);
      const indexMap = transData.transaction.message.instructions[0].accounts.map(
        (a: any) => a.toString()
      );
      const accountKeys = transData.transaction.message.accountKeys.map(
        (x: any) => x.toBase58()
      );
      const accountMapped: any = [];

      for (let j = 0; j < indexMap.length; j++) {
        accountMapped[j] = accountKeys[Number(indexMap[j])];
      }

      return [
        {
          price: parsedDict['price'] / LAMPORTS_PER_SOL,
          expiry: parsedDict['seller_expiry'],
          pdaAddress: accountMapped[8],
          auctionHouse: accountMapped[7],
          tokenAddress: accountMapped[2],
          tokenMint: accountMapped[4],
          seller: accountMapped[0],
          sellerReferral: accountMapped[6]
        }
      ];
    }
  }

  return [];
};

const parseMESale = (logData: any, transData: any) => {
  for (const element of logData.logs) {
    if (element.includes('"seller_expiry"')) {
      const parsedDict = JSON.parse(element.split('Program log: ')[1]);
      const indexMap = transData.transaction.message.instructions[2].accounts.map(
        (a: any) => a.toString()
      );
      const accountKeys = transData.transaction.message.accountKeys.map(
        (x: any) => x.toBase58()
      );
      const accountMapped: any = [];

      for (let j = 0; j < indexMap.length; j++) {
        accountMapped[j] = accountKeys[Number(indexMap[j])];
      }

      return [
        {
          price: parsedDict['price'] / LAMPORTS_PER_SOL,
          buyer_expiry: parsedDict['buyer_expiry'],
          seller_expiry: parsedDict['seller_expiry'],
          auctionHouse: accountMapped[9],
          tokenAddress: accountMapped[7],
          tokenMint: accountMapped[4],
          buyer: accountMapped[0],
          buyerReferral: accountMapped[8],
          seller: accountMapped[1],
          sellerReferral: accountMapped[14]
        }
      ];
    }
  }

  return [];
};

const parseMEPlaceBid = (logData: any, transData: any) => {
  for (const element of logData.logs) {
    if (element.includes('Program log: {"price":')) {
      const parsedDict = JSON.parse(element.split('Program log: ')[1]);
      const indexMap = transData.transaction.message.instructions[0].accounts.map(
        (a: any) => a.toString()
      );
      const accountKeys = transData.transaction.message.accountKeys.map(
        (x: any) => x.toBase58()
      );
      const accountMapped: any = [];

      for (let j = 0; j < indexMap.length; j++) {
        accountMapped[j] = accountKeys[Number(indexMap[j])];
      }

      return [
        {
          price: parsedDict['price'] / LAMPORTS_PER_SOL,
          expiry: parsedDict['buyer_expiry'],
          auctionHouse: accountMapped[6],
          tokenMint: accountMapped[2],
          buyer: accountMapped[0],
          buyerReferral: accountMapped[5]
        }
      ];
    }
  }

  return [];
};

const parseMECancelListing = (logData: any, transData: any) => {
  if (logData.signature === transData.transaction.signatures[0]) {
    const indexMap = transData.transaction.message.instructions[0].accounts.map(
      (a: any) => a.toString()
    );
    const accountKeys = transData.transaction.message.accountKeys.map(
      (x: any) => x.toBase58()
    );
    const accountMapped: any = [];

    for (let j = 0; j < indexMap.length; j++) {
      accountMapped[j] = accountKeys[Number(indexMap[j])];
    }

    return [
      {
        auctionHouse: accountMapped[5],
        tokenMint: accountMapped[3],
        seller: accountMapped[0],
        sellerReferral: accountMapped[4]
      }
    ];
  } else {
    console.error(
      `Signature mismatched: ${logData.signature}, ${transData.transaction.signatures[0]}`
    );
  }

  return [];
};

const parseMECancelBid = (logData: any, transData: any) => {
  if (logData.signature === transData.transaction.signatures[0]) {
    const indexMap = transData.transaction.message.instructions[0].accounts.map(
      (a: any) => a.toString()
    );
    const accountKeys = transData.transaction.message.accountKeys.map(
      (x: any) => x.toBase58()
    );
    const accountMapped: any = [];

    for (let j = 0; j < indexMap.length; j++) {
      accountMapped[j] = accountKeys[Number(indexMap[j])];
    }

    return [
      {
        auctionHouse: accountMapped[4],
        tokenMint: accountMapped[2],
        buyer: accountMapped[0],
        buyerReferral: accountMapped[3]
      }
    ];
  } else {
    console.error(
      `Signature mismatched: ${logData.signature}, ${transData.transaction.signatures[0]}`
    );
  }

  return [];
};

const processSolanartTrans = async (signature: string) => {
  try {
    const transData = await getTransaction(signature);
    if (transData == null) {
      console.error('transData is null');
      return;
    }

    const logMessages = transData.meta?.logMessages ?? [];

    if ( // Sale
      logMessages.includes('Program log: Instruction: Buy') &&
      logMessages.includes('Program log: Create') &&
      logMessages.includes(`Program ${SOLANART_PUBLIC_KEY} success`)
    ) {
      parseSolanartLog(transData, 'Sale');
    } else if ( // CreateOffer
      logMessages.includes('Program log: Instruction: CreateOffer') &&
      logMessages.includes(`Program ${SOLANART_PUBLIC_KEY} success`)
    ) {
      parseSolanartLog(transData, 'CreateOffer');
    } else if ( // Sell
      logMessages.includes('Program log: Instruction: Sell ' /* Attention: do not remove the trailing space after word 'Sell' */) &&
      logMessages.includes(`Program ${SOLANART_PUBLIC_KEY} success`)
    ) {
      parseSolanartLog(transData, 'Sell');
    } else if ( // Buy = Unlist
      logMessages.includes('Program log: Instruction: Buy') &&
      logMessages.includes(`Program ${SOLANART_PUBLIC_KEY} success`)
    ) {
      parseSolanartLog(transData, 'Buy');
    } else if ( // Update price
      logMessages.includes('Program log: Instruction: Update price') &&
      logMessages.includes(`Program ${SOLANART_PUBLIC_KEY} success`)
    ) {
      parseSolanartLog(transData, 'Update price');
    } else {
      console.log(
        '-------------------------- Unknown transaction type (Solanart) ----------------------------'
      );
      console.log({ signature });
      for (const log of logMessages) {
        console.log(log);
      }
    }
  } catch (err) {
    console.log('Error in processSolanartTrans: \n', err);
  }

  // let tx;
  // while (tx === null) {
  //   tx = await connection.getTransaction(signature);
  //   if (tx === null) {
  //     await delay(30);
  //   }
  // }

  // const ix = coder.instruction.decode(
  //   tx?.transaction?.message?.instructions?.[0].data ?? '',
  //   'base58',
  // );
  // if (!ix) throw new Error("could not parse data");

  // const accountMetas = (tx?.transaction?.message?.instructions?.[0] ?? []).map(
  //   (idx) => ({
  //     pubkey: tx.transaction.message.accountKeys[idx],
  //     isSigner: tx.transaction.message.isAccountSigner(idx),
  //     isWritable: tx.transaction.message.isAccountWritable(idx),
  //   }),
  // );
  // const formatted = coder.instruction.format(ix, accountMetas);

  // console.log(ix, formatted);
};

const parseSolanartLog = async (transData: any, type: string) => {
  try {
    let SolanartData: any = [];

    try {
      if (type == 'Sale') {
        SolanartData = parseSolanartSale(transData);
      } else if (type == 'CreateOffer') {
        SolanartData = parseSolanartCreateOffer(transData);
      } else if (type == 'Sell') {
        SolanartData = parseSolanartSell(transData);
      } else if (type == 'Buy') {
        SolanartData = parseSolanartBuy(transData);
      } else if (type == 'Update price') {
        SolanartData = parseSolanartUpdatePrice(transData);
      }
    } catch (err) {
      SolanartData = [];
      console.log('Error in parse Solanart log', err);
    }

    console.log(`-------------------- Solanart - ${type} --------------------`);
    console.log({ LogData: transData?.transaction?.signatures?.[0] });
    console.log({ SolanartData });

    const newDocument = await DataModel.create({
      marketplace: 'Solanart',
      signature: transData?.transaction?.signatures?.[0],
      instruction: type,
      data: SolanartData
    });

    console.log({ Saved: newDocument._id.toString() });
  } catch (err) {
    console.log({ 'Error in parseSolanartLog': err });
  }
}

const parseSolanartSale = (transData: any) => {
  // test with 2j7RSr5ZP1VD3Z9YM8gMtErXPr9pjS3W7NSKXfaWFCF6ceGFRLPFzKExDrzGBZ7mGMUUbkud8PyC6zCwAPNQytxH
  const logMessages = transData?.meta?.logMessages ?? [];
  const priceMessage = logMessages?.[logMessages.indexOf('Program log: Instruction: Buy') + 3];
  console.log(priceMessage);
  const price = priceMessage.split(' ').slice(-3).reduce((sum: number, curr: string) => (+curr) + sum) / LAMPORTS_PER_SOL;

  return [{
    seller: transData?.transaction?.message?.accountKeys[0].toBase58(),
    buyer: transData?.transaction?.message?.accountKeys[10].toBase58(),
    tokenAddress: transData?.transaction?.message?.accountKeys[7].toBase58(),
    price,
  }];
};

const parseSolanartCreateOffer = (transData: any) => {
  // test with K2LQhfLppJva8XLc9ha9QnVkHggkfB8MbdYiXxtuS4bhjYeRzi2A1SjiC9WZCaVsntTe5eNwfTwvT6gJwWxFXzk
  const logMessages = transData?.meta?.logMessages ?? [];
  const priceMessage = logMessages?.[logMessages.indexOf('Program log: Instruction: CreateOffer') + 1];
  const price = +priceMessage.split(' ').reverse()[1] / LAMPORTS_PER_SOL;

  return [{
    buyer: transData?.transaction?.message?.accountKeys[0].toBase58(),
    tokenAddress: transData?.transaction?.message?.accountKeys[5].toBase58(),
    price,
  }];
};

const parseSolanartSell = (transData: any) => {
  // test with 4deSZwWjQvRJt9FaMeaQf3X31DKJxFfGsHb3XsQ1ZHno4bQfPyWLCaTTMQyHB99SbPuGjDS3duMs3vT3pstCmyD3
  return [{
    seller: transData?.transaction?.message?.accountKeys[0].toBase58(),
    tokenAddress: transData?.transaction?.message?.accountKeys[9].toBase58(),
    // TODO Could not get the price
  }];
};

const parseSolanartBuy = (transData: any) => {
  // test with 285GniC4RPAdAsJ2JKme5GAyUATbszDXtJr3Qq7sMtCFqjb3BdFrJsAuqYPSTs14RKqvB29tVPuL1qgMmb9ycGx3
  const logMessages = transData?.meta?.logMessages ?? [];
  const priceMessage = logMessages?.[logMessages.indexOf('Program log: Instruction: Buy') + 2];
  const price = priceMessage.split(' ').slice(-3).reduce((sum: number, curr: string) => +curr + sum) / LAMPORTS_PER_SOL;

  return [{
    seller: transData?.transaction?.message?.accountKeys[0].toBase58(),
    tokenAddress: transData?.transaction?.message?.accountKeys[8].toBase58(),
    price,
  }];
};

const parseSolanartUpdatePrice = (transData: any) => {
  // test with 43X8CUKaNNU7MuFxyxoTiCzEcoPjSXPzdRmL6ox3vNbVxEKxMg1JKbcDT9TNYEg6f7WBdEkTxtLK79gXLMZZni8X
  const logMessages = transData?.meta?.logMessages ?? [];
  const priceMessage = logMessages?.[logMessages.indexOf('Program log: Instruction: Update price') + 1];
  const price = +priceMessage.split(' ').reverse()[0] / LAMPORTS_PER_SOL;
  const oldPrice = +priceMessage.split(' ').reverse()[1] / LAMPORTS_PER_SOL;

  return [{
    seller: transData?.transaction?.message?.accountKeys[0].toBase58(),
    tokenAddress: transData?.transaction?.message?.accountKeys[2].toBase58(),
    price,
    oldPrice,
  }];
};
