import { Connection } from '@solana/web3.js';
import { getTransaction } from './getTransaction';
import { Transactions } from '../mongo/transactions';

const SOLANART_PUBLIC_KEY = 'CJsLwbP1iu5DuUikHEJnLfANgKy6stB2uFgvBBHoyxwz';
const LAMPORTS_PER_SOL = 1e9;

export const processSolanartTrans = async (connection: Connection, signature: string) => {
  try {
    const transData = await getTransaction(connection, signature);
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

    const newDocument = await Transactions.create({
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
  const price = priceMessage.split(' ').slice(-3).reduce((sum: number, curr: string) => (+curr) + sum) / LAMPORTS_PER_SOL;

  return [{
    buyer: transData?.transaction?.message?.accountKeys[0].toBase58(),
    seller: transData?.transaction?.message?.accountKeys[10].toBase58(),
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
