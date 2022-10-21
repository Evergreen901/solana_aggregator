import { createServer } from "http";
import WebSocket, { Server } from "ws";
import { Connection, PublicKey } from "@solana/web3.js";
import { Schema, model, connect } from 'mongoose';

const RPC_HTTPS = "https://api.mainnet-beta.solana.com/";
const RPC_WS = "wss://api.mainnet-beta.solana.com/";
const LAMPORTS_PER_SOL = 1e9;
const MONGODB_CONNECTION_STRING = 'mongodb://localhost:27017/test';

// websocket stuff
interface ExtWebSocket extends WebSocket {
  isAlive: boolean;
}

interface IMEData {
  signature: string;
  instruction: string;
  data: any;
}

const medataSchema = new Schema<IMEData>({
  signature: { type: String, required: true },
  instruction: { type: String, required: true },
  data: {type: Array}
});

const MEDataModel = model<IMEData>('medata', medataSchema);

const server = createServer();

const wss = new Server({ server });

const delay = (milliseconds: number) => {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
};

wss.on("connection", (ws: ExtWebSocket) => {
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

wss.on("close", function close() {
  clearInterval(interval);
});

server.listen(3337);

const connection = new Connection(RPC_HTTPS, {
  commitment: "confirmed",
  wsEndpoint: RPC_WS,
});

console.log("Server started");

(async () => {
  await connect(MONGODB_CONNECTION_STRING);

  // Register a callback to listen to the wallet (ws subscription)
  try {
    connection.onLogs(
      new PublicKey("M2mx93ekt1fmXSVkTrUL9xVFHkmME8HTUi5Cyc5aF7K"),
      (logSubscribe) => newTransProcessing(logSubscribe),
      "confirmed"
    );
  } catch {
    console.log("ERR IN async");
    process.exit(0);
  }
})();

// Transaction getter
const newTransProcessing = (logData: any) => {
  try {
    if ( // Listing
      logData.logs.includes("Program log: Instruction: Sell") &&
      logData.logs.includes("Program M2mx93ekt1fmXSVkTrUL9xVFHkmME8HTUi5Cyc5aF7K success")
    ) {
      processTransLog(logData, logData.signature, 'Listing');
    } else if ( // Sale
      logData.logs.includes("Program log: Instruction: Deposit") &&
      logData.logs.includes("Program log: Instruction: Buy") &&
      logData.logs.includes("Program log: Instruction: ExecuteSale") &&
      logData.logs.includes("Program M2mx93ekt1fmXSVkTrUL9xVFHkmME8HTUi5Cyc5aF7K success")
    ) {
      processTransLog(logData, logData.signature, 'Sale');
    } else if ( // Place Bid
      logData.logs.includes("Program log: Instruction: Buy") &&
      logData.logs.includes("Program M2mx93ekt1fmXSVkTrUL9xVFHkmME8HTUi5Cyc5aF7K success")
    ) {
      processTransLog(logData, logData.signature, 'Place Bid');
    } else if ( // Cancel Listing
      logData.logs.includes("Program log: Instruction: CancelSell") &&
      logData.logs.includes("Program log: Instruction: SetAuthority") &&
      logData.logs.includes("Program M2mx93ekt1fmXSVkTrUL9xVFHkmME8HTUi5Cyc5aF7K success")
    ) {
      processTransLog(logData, logData.signature, 'Cancel Listing');
    } else if ( // Cancel Bid
      logData.logs.includes("Program log: Instruction: CancelBuy") &&
      logData.logs.includes("Program M2mx93ekt1fmXSVkTrUL9xVFHkmME8HTUi5Cyc5aF7K success")
    ) {
      processTransLog(logData, logData.signature, 'Cancel Bid');
    } else {
      console.log('-------------------------- Unknown transaction ----------------------------');
      console.log({signature: logData.signature});
      for (const log of logData.logs) {
        if (log.startsWith('Program log: Instruction: ')) {
          console.log(log);
        }
      }
    }
  } catch (err) {
    console.log("ERR IN newTransProcessing: \n", err);
  }
};

const processTransLog = async (logData: any, sign: any, type: string) => {
  try {
    let transData = await connection.getTransaction(sign, {
      commitment: "confirmed",
    });
    let tries = 0;
    while (transData === null && tries < 4) {
      transData = await connection.getTransaction(sign, {
        commitment: "confirmed",
      });
      tries += 1;
      await delay(30);
    }
    if (transData !== null) {
      let MEData: any = [];

      try {
        if (type == 'Listing') {
          MEData = logAnalyzeListing(logData, transData);
        } else if (type == 'Sale') {
          MEData = logAnalyzeSale(logData, transData);
        } else if (type == 'Place Bid') {
          MEData = logAnalyzePlaceBid(logData, transData);
        } else if (type == 'Cancel Listing') {
          MEData = logAnalyzeCancelListing(logData, transData);
        } else if (type == 'Cancel Bid') {
          MEData = logAnalyzeCancelBid(logData, transData);
        }
      } catch (err) {
        MEData = [];
        console.log("Error in LogAnalyzer");
      }

      console.log(`-------------------- ${type} --------------------`);
      console.log({MEData});
      console.log({LogData: logData.signature});

      let newDocument = await MEDataModel.create({
        signature: logData.signature,
        instruction: type,
        data: MEData,
      });
    
      console.log({Saved: newDocument._id.toString()});
    } else {
      console.error('transData is null');
    }
  } catch (err) {
    console.log({ err_from_signatureGetter: err });
  }
};

const logAnalyzeListing = (logData: any, transData: any) => {
  if (logData.signature === transData.transaction.signatures[0]) {
    for (const element of logData.logs) {
      if (element.includes('Program log: {"price":')) {
        const parsedDict = JSON.parse(element.split("Program log: ")[1]);
        const indexMap = transData.transaction.message.instructions[0].accounts.map((a: any) =>
          a.toString()
        );
        const accountKeys = transData.transaction.message.accountKeys.map((x: any) => x.toBase58());
        const accountMapped: any = [];

        for (let j = 0; j < indexMap.length; j++) {
          accountMapped[j] = accountKeys[Number(indexMap[j])];
        }

        return [
          {
            price: parsedDict["price"] / LAMPORTS_PER_SOL,
            expiry: parsedDict["seller_expiry"],
            pdaAddress: accountMapped[8],
            auctionHouse: accountMapped[7],
            tokenAddress: accountMapped[2],
            tokenMint: accountMapped[4],
            seller: accountMapped[0],
            sellerReferral: accountMapped[6],
          },
        ];
      }
    }
  } else {
    console.error(`Signature mismatched: ${logData.signature}, ${transData.transaction.signatures[0]}`)
  }

  return [];
};

const logAnalyzeSale = (logData: any, transData: any) => {
  if (logData.signature === transData.transaction.signatures[0]) {
    for (const element of logData.logs) {
      if (element.includes('"seller_expiry"')) {
        const parsedDict = JSON.parse(element.split("Program log: ")[1]);
        const indexMap = transData.transaction.message.instructions[2].accounts.map((a: any) =>
          a.toString()
        );
        const accountKeys = transData.transaction.message.accountKeys.map((x: any) => x.toBase58());
        const accountMapped: any = [];

        for (let j = 0; j < indexMap.length; j++) {
          accountMapped[j] = accountKeys[Number(indexMap[j])];
        }

        return [
          {
            price: parsedDict["price"] / LAMPORTS_PER_SOL,
            buyer_expiry: parsedDict["buyer_expiry"],
            seller_expiry: parsedDict["seller_expiry"],
            auctionHouse: accountMapped[9],
            tokenAddress: accountMapped[7],
            tokenMint: accountMapped[4],
            buyer: accountMapped[0],
            buyerReferral: accountMapped[8],
            seller: accountMapped[1],
            sellerReferral: accountMapped[14],
          },
        ];
      }
    }
  } else {
    console.error(`Signature mismatched: ${logData.signature}, ${transData.transaction.signatures[0]}`)
  }

  return [];
};

const logAnalyzePlaceBid = (logData: any, transData: any) => {
  if (logData.signature === transData.transaction.signatures[0]) {
    for (const element of logData.logs) {
      if (element.includes('Program log: {"price":')) {
        const parsedDict = JSON.parse(element.split("Program log: ")[1]);
        const indexMap = transData.transaction.message.instructions[0].accounts.map((a: any) =>
          a.toString()
        );
        const accountKeys = transData.transaction.message.accountKeys.map((x: any) => x.toBase58());
        const accountMapped: any = [];

        for (let j = 0; j < indexMap.length; j++) {
          accountMapped[j] = accountKeys[Number(indexMap[j])];
        }

        return [
          {
            price: parsedDict["price"] / LAMPORTS_PER_SOL,
            expiry: parsedDict["buyer_expiry"],
            auctionHouse: accountMapped[6],
            tokenMint: accountMapped[2],
            buyer: accountMapped[0],
            buyerReferral: accountMapped[5],
          },
        ];
      }
    }
  } else {
    console.error(`Signature mismatched: ${logData.signature}, ${transData.transaction.signatures[0]}`)
  }

  return [];
};

const logAnalyzeCancelListing = (logData: any, transData: any) => {
  if (logData.signature === transData.transaction.signatures[0]) {
    const indexMap = transData.transaction.message.instructions[0].accounts.map((a: any) =>
      a.toString()
    );
    const accountKeys = transData.transaction.message.accountKeys.map((x: any) => x.toBase58());
    const accountMapped: any = [];

    for (let j = 0; j < indexMap.length; j++) {
      accountMapped[j] = accountKeys[Number(indexMap[j])];
    }

    return [
      {
        auctionHouse: accountMapped[5],
        tokenMint: accountMapped[3],
        seller: accountMapped[0],
        sellerReferral: accountMapped[4],
      },
    ];
  } else {
    console.error(`Signature mismatched: ${logData.signature}, ${transData.transaction.signatures[0]}`)
  }

  return [];
};

const logAnalyzeCancelBid = (logData: any, transData: any) => {
  if (logData.signature === transData.transaction.signatures[0]) {
    const indexMap = transData.transaction.message.instructions[0].accounts.map((a: any) =>
      a.toString()
    );
    const accountKeys = transData.transaction.message.accountKeys.map((x: any) => x.toBase58());
    const accountMapped: any = [];

    for (let j = 0; j < indexMap.length; j++) {
      accountMapped[j] = accountKeys[Number(indexMap[j])];
    }

    return [
      {
        auctionHouse: accountMapped[4],
        tokenMint: accountMapped[2],
        buyer: accountMapped[0],
        buyerReferral: accountMapped[3],
      },
    ];
  } else {
    console.error(`Signature mismatched: ${logData.signature}, ${transData.transaction.signatures[0]}`)
  }

  return [];
};
