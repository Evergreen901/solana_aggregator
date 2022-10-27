import { clusterApiUrl, Connection, PublicKey } from '@solana/web3.js';
import { AccountLayout, TOKEN_PROGRAM_ID } from "@solana/spl-token";

const connection = new Connection(clusterApiUrl('mainnet-beta'), 'confirmed');

export const getTokenAddress = async (ownerAddress: string, tokenAccountAddress: string) => {
  const tokenAccounts = await connection.getTokenAccountsByOwner(
    new PublicKey(ownerAddress),
    {
      programId: TOKEN_PROGRAM_ID,
    }
  );
  
  for (let tokenAccount of tokenAccounts.value) {
    if (tokenAccount.pubkey.toBase58() == tokenAccountAddress) {
      const accountData = AccountLayout.decode(tokenAccount.account.data);
      return accountData.mint.toBase58();
    }
  }

  return null;
}
