import { Connection } from '@solana/web3.js';
import { getTransaction } from './getTransaction';
import { Transactions } from '../mongo/transactions';

const LAMPORTS_PER_SOL = 1e9;
const ME_PUBLIC_KEY = 'M2mx93ekt1fmXSVkTrUL9xVFHkmME8HTUi5Cyc5aF7K';

export const processMETrans = async (connection: Connection, logData: any) => {
  try {
    const transData = await getTransaction(connection, logData.signature);
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

    const newDocument = await Transactions.create({
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