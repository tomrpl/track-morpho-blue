import { MorphoBlue } from "ethers-types";

export type MarketState = {
  totalSupplyAssets: bigint;
  totalSupplyShares: bigint;
  totalBorrowAssets: bigint;
  totalBorrowShares: bigint;
  lastUpdate: bigint;
  fee: bigint;
};

export type PositionUser = {
  supplyShares: bigint;
  borrowShares: bigint;
  collateral: bigint;
};

export type Contracts = { morphoBlue: MorphoBlue };
