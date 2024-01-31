import dotenv from "dotenv";
import { fetchBorrowData, getProvider, morphoContracts } from "./chainfetcher";
import { formatEther } from "ethers";
import { whitelistedIds } from "./marketsId";
dotenv.config();

// to replace by the position you are looking to track
const usr = "0xc25d35024Dd497D3825115828994Bb08D12a3aa7";

export const run = async () => {
  const provider = getProvider();
  const contracts = await morphoContracts(provider);

  for (const marketId of whitelistedIds) {
    try {
      const [borrowAPY, borrowAssetsUser, marketTotalBorrow] =
        await fetchBorrowData(
          contracts,
          marketId, // using the current marketId from the loop
          usr,
          provider
        );

      console.log(`Results for marketId: ${marketId}`);
      console.log("borrowAPY: ", formatEther(borrowAPY * 100n));
      console.log("borrowAssetsUser: ", borrowAssetsUser);
      console.log("marketTotalBorrow: ", marketTotalBorrow);
    } catch (error) {
      console.error(`Error fetching data for marketId: ${marketId}`, error);
    }
  }
};

run().then(() => process.exit(0));
