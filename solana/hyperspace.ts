import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { getTransaction } from './getTransaction';
import { getTokenAddress } from './getTokenAddress';
import { Transactions } from '../mongo/transactions';

const MARKETPLACE = 'HyperSpace';
export const PUBLIC_KEY = 'HYPERfwdTjyJ2SCaKHmpF2MtrXqWxrsotYDsTrshHWq8';

export const processTrans = async (connection: Connection, signature: string) => {
  try {
    const transData = await getTransaction(connection, signature);
    if (transData == null) {
      console.error('transData is null');
      return;
    }

    const logMessages = transData.meta?.logMessages ?? [];

    if ( // Sale
      logMessages.includes('Program log: Instruction: Buy') &&
      logMessages.includes('Program log: Instruction: ExecuteSale') &&
      logMessages.includes(`Program ${PUBLIC_KEY} success`)
    ) {
      parseLog(transData, 'Sale');
    } else if ( // Delisting
      logMessages.includes('Program log: Instruction: Cancel') &&
      logMessages.includes('Program log: Instruction: Revoke') &&
      logMessages.includes(`Program ${PUBLIC_KEY} success`)
    ) {
      parseLog(transData, 'Delisting');
    } else if (
      logMessages.includes('Program log: Instruction: Sell') &&
      logMessages.includes('Program log: Instruction: Approve') &&
      logMessages.includes(`Program ${PUBLIC_KEY} success`)
    ) {
      parseLog(transData, 'Listing');
    } else if (
      logMessages.includes('Program log: Instruction: Withdraw') &&
      logMessages.includes('Program log: Instruction: Cancel') &&
      logMessages.includes(`Program ${PUBLIC_KEY} success`)
    ) {
      parseLog(transData, 'CancelOffer');
    } else if (
      logMessages.includes('Program log: Instruction: Deposit') &&
      logMessages.includes('Program log: Instruction: CreateTradeState') &&
      logMessages.includes('Program log: Instruction: Buy') &&
      logMessages.includes(`Program ${PUBLIC_KEY} success`)
    ) {
      parseLog(transData, 'Offer');
    } else {
      console.log(
        `-------------------------- Unknown transaction type (${MARKETPLACE}) ----------------------------`
      );
      console.log({ signature });
      for (const log of logMessages) {
        console.log(log);
      }
    }
  } catch (err) {
    console.log(`Error in process${MARKETPLACE}Trans: \n`, err);
  }
};

const parseLog = async (transData: any, type: string) => {
  try {
    let data: any = [];

    try {
      if (type == 'Sale') {
        data = parseSale(transData);
      } else if (type == 'Delisting') {
        data = parseDelisting(transData);
      } else if (type == 'Listing') {
        data = await parseListing(transData);
      } else if (type == 'CancelOffer') {
        data = parseOfferRescinded(transData);
      } else if (type == 'Offer') {
        data = parseOffer(transData);
      }
    } catch (err) {
      data = [];
      console.log(`Error in parse ${MARKETPLACE} log`, err);
    }

    console.log(`-------------------- ${MARKETPLACE} - ${type} --------------------`);
    console.log({ LogData: transData?.transaction?.signatures?.[0] });
    console.log({ data });

    const newDocument = await Transactions.create({
      marketplace: MARKETPLACE,
      signature: transData?.transaction?.signatures?.[0],
      instruction: type,
      data
    });

    console.log({ Saved: newDocument._id.toString() });
  } catch (err) {
    console.log(`Error in parse${MARKETPLACE}Log:`, err);
  }
}

const parseSale = (transData: any) => {
  // test with 4rKGCBkQtLn8n8W9uEBRDRMALYvtG1DCYhBRmyC4g1vmeTJXRN6DzyKRuv6fp4Lb9gLD9zBwyfLepFfhMxgM9kQk
  const postBalances = transData.meta.postBalances;
  const preBalances = transData.meta.preBalances;
  const price =
    ((postBalances[3] - preBalances[3]) + 
    (postBalances[4] - preBalances[4]) +
    (postBalances[7] - preBalances[7]) +
    (postBalances[11] - preBalances[11])) / LAMPORTS_PER_SOL;

  return [{
    seller: transData?.transaction?.message?.accountKeys[4].toBase58(),
    buyer: transData?.transaction?.message?.accountKeys[0].toBase58(),
    tokenAddress: transData?.transaction?.message?.accountKeys[14].toBase58(),
    price,
  }];
};

const parseDelisting = (transData: any) => {
  // test with 5DmjQDcTictbyjUTqWmyfvzHRNfoiz2MEYDkBMEkCJFNq2aqhYRew5M2CYKs5P9xYsN58DmVB36pwegFhwDCnf5B
  return [{
    seller: transData?.transaction?.message?.accountKeys[0].toBase58(),
    tokenAddress: transData?.transaction?.message?.accountKeys[3].toBase58(),
  }];
};

const parseListing = async (transData: any) => {
  const seller = transData?.transaction?.message?.accountKeys[0].toBase58();

  if (transData.meta.logMessages.includes('Program log: Instruction: CreateTradeState')) {
    // test with 8Z7oXN9ZgfCbgFHd8duxAsLvYuQEaHBXuAptfKtYUVDKsxt3fRyKcY57oE3FLBNH3iy8HsJ8mPuG5kUNUA81ykK
    return [{
      seller,
      tokenAddress: transData?.transaction?.message?.accountKeys[7].toBase58(),
      price: 0, // TODO couldn't get the price
    }];
  } else {
    // test with 5cccwErWQTbXmBJrZUuce1T57dT5MQeAn5w7LH2uyXicmsK4cF7hYTihzpRMMKa4x3xDTgJmPBRfdDRSiztSepVU
    const tokenAccountAddress = transData?.transaction?.message?.accountKeys[2].toBase58();
    const tokenAddress = await getTokenAddress(seller, tokenAccountAddress);

    return [{
      seller,
      tokenAddress: tokenAddress ?? tokenAccountAddress,
      price: 0, // TODO couldn't get the price
    }];
  }
};

const parseOfferRescinded = (transData: any) => {
  // test with 2WnXF2hjFhG9SYd5BiGWWCtPzpiPEkgrmKDXptmRrZgrEH6JQJvLqF4CPTyBZ4PgSRJsK7big99vN6ytDzzzfvFG
  const price = (transData.meta.preBalances[3] - transData.meta.postBalances[3]) / LAMPORTS_PER_SOL;
  return [{
    buyer: transData?.transaction?.message?.accountKeys[0].toBase58(),
    tokenAddress: transData?.transaction?.message?.accountKeys[5].toBase58(),
    price,
  }];
};

const parseOffer = (transData: any) => {
  // test with ZGZ1Z6Z6DmMcUraQyBrw5oEbq7YaMy8C1djhHLMbJeXwNLCVhHVJCTMrZdsjzR2wLkHAjnjNRLuS7UPefyzXYLd
  const price = (transData.meta.postBalances[2] - transData.meta.preBalances[2]) / LAMPORTS_PER_SOL;
  return [{
    buyer: transData?.transaction?.message?.accountKeys[0].toBase58(),
    tokenAddress: transData?.transaction?.message?.accountKeys[11].toBase58(),
    price,
  }];
};