// borrowAPR, borrowAssetsUser and marketTotalBorrow

import { Provider, ZeroAddress, ethers } from "ethers";

import { MORPHO_ADDRESS, IRM_ADDRESS, SECONDS_PER_YEAR } from "./constants";

import { MorphoBlue__factory, BlueIrm__factory } from "ethers-types";

import * as maths from "./utils/maths";
import * as shares from "./utils/shares";

import { Contracts, MarketState, PositionUser } from "./types";
import { MarketParamsStruct } from "ethers-types/dist/protocols/morpho/blue/MorphoBlue";
import { MulticallWrapper } from "ethers-multicall-provider";
const accrueInterests = (
  lastBlockTimestamp: bigint,
  marketState: MarketState,
  borrowRate: bigint
) => {
  const elapsed = lastBlockTimestamp - marketState.lastUpdate;
  if (elapsed === 0n) return marketState;
  if (marketState.totalBorrowAssets !== 0n) {
    const interest = maths.wMulDown(
      marketState.totalBorrowAssets,
      maths.wTaylorCompounded(borrowRate, elapsed)
    );
    const marketWithNewTotal = {
      ...marketState,
      totalBorrowAssets: marketState.totalBorrowAssets + interest,
      totalSupplyAssets: marketState.totalSupplyAssets + interest,
    };

    if (marketWithNewTotal.fee !== 0n) {
      const feeAmount = maths.wMulDown(interest, marketWithNewTotal.fee);
      // The fee amount is subtracted from the total supply in this calculation to compensate for the fact
      // that total supply is already increased by the full interest (including the fee amount).
      const feeShares = shares.toSharesDown(
        feeAmount,
        marketWithNewTotal.totalSupplyAssets - feeAmount,
        marketWithNewTotal.totalSupplyShares
      );
      //  Useless to keep the feeRecipient. Still keeping it there to keep the original Solidity function.
      // position[id][feeRecipient].supplyShares += feeShares;
      return {
        ...marketWithNewTotal,
        totalSupplyShares: marketWithNewTotal.totalSupplyShares + feeShares,
      };
    }
    return marketWithNewTotal;
  }
  return marketState;
};

export const getProvider = () => {
  const endpoint = process.env.RPC_URL;
  if (!endpoint) {
    console.log("RPC_URL not set. Exiting…");
    process.exit(1);
  }
  return MulticallWrapper.wrap(new ethers.JsonRpcProvider(endpoint));
};

export const getChainId = async (provider?: Provider) => {
  const { chainId } = await (provider ?? getProvider()).getNetwork();
  return chainId;
};

export const morphoContracts = async (provider?: Provider) => {
  if (typeof MORPHO_ADDRESS !== "string" || !MORPHO_ADDRESS)
    throw new Error("MORPHO_ADDRESS unset");
  const morphoBlue = MorphoBlue__factory.connect(
    MORPHO_ADDRESS,
    provider ?? getProvider()
  );
  return { morphoBlue };
};

export const fetchBorrowData = async (
  { morphoBlue }: Contracts,
  id: string,
  usr: string,
  provider?: Provider
): Promise<[bigint, bigint, bigint]> => {
  try {
    provider ??= getProvider();
    const block = await provider.getBlock("latest");

    const [marketParams_, marketState_, position_] = await Promise.all([
      morphoBlue.idToMarketParams(id),
      morphoBlue.market(id),
      morphoBlue.position(id, usr),
    ]);

    const marketParams: MarketParamsStruct = {
      loanToken: marketParams_.loanToken,
      collateralToken: marketParams_.collateralToken,
      oracle: marketParams_.oracle,
      irm: marketParams_.irm,
      lltv: marketParams_.lltv,
    };

    let marketState: MarketState = {
      totalSupplyAssets: marketState_.totalSupplyAssets,
      totalSupplyShares: marketState_.totalSupplyShares,
      totalBorrowAssets: marketState_.totalBorrowAssets,
      totalBorrowShares: marketState_.totalBorrowShares,
      lastUpdate: marketState_.lastUpdate,
      fee: marketState_.fee,
    };

    const position: PositionUser = {
      supplyShares: position_.supplyShares,
      borrowShares: position_.borrowShares,
      collateral: position_.collateral,
    };

    const irm = BlueIrm__factory.connect(IRM_ADDRESS, provider);
    const borrowRate =
      IRM_ADDRESS !== ZeroAddress
        ? await irm.borrowRateView(marketParams, marketState)
        : 0n;
    const borrowAPY = maths.wTaylorCompounded(
      borrowRate,
      BigInt(SECONDS_PER_YEAR)
    );

    marketState = accrueInterests(
      BigInt(block!.timestamp),
      marketState,
      borrowRate
    );

    const marketTotalBorrow = marketState.totalBorrowAssets;
    const borrowAssetsUser = shares.toAssetsUp(
      position.borrowShares,
      marketState.totalBorrowAssets,
      marketState.totalBorrowShares
    );

    return [borrowAPY, borrowAssetsUser, marketTotalBorrow];
  } catch (error) {
    throw error;
  }
};
