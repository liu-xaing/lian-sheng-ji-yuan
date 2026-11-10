const fs = require("fs");
const path = require("path");

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const COLLECTION_EVENTS = new Set(["Transfer", "NFTMinted"]);
const MARKET_EVENTS = new Set([
  "ItemListed",
  "ItemSold",
  "ItemCancelled",
  "PriceUpdated",
]);

function normalizeAddress(address, label) {
  if (typeof address !== "string" || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
    throw new Error(`迁移数据中的${label}地址无效`);
  }
  return address.toLowerCase();
}

function eventValues(event) {
  if (!event.values || typeof event.values !== "object") {
    throw new Error(`迁移历史事件缺少 values: ${event.type}`);
  }
  return event.values;
}

function orderedEvents(events) {
  return [...events].sort((left, right) => {
    const blockDifference = BigInt(left.blockNumber) - BigInt(right.blockNumber);
    if (blockDifference !== 0n) return blockDifference < 0n ? -1 : 1;
    const leftIndex = BigInt(left.logIndex || 0);
    const rightIndex = BigInt(right.logIndex || 0);
    return leftIndex < rightIndex ? -1 : leftIndex > rightIndex ? 1 : 0;
  });
}

function captureHistorySnapshot({ collectionAddress, marketAddress, historyEvents }) {
  const collection = normalizeAddress(collectionAddress, "NFTCollection");
  const market = normalizeAddress(marketAddress, "NFTMarket");
  if (!Array.isArray(historyEvents)) throw new Error("迁移历史数据格式无效");

  const events = orderedEvents(historyEvents.filter((event) => {
    if (!event || typeof event.type !== "string") return false;
    const address = typeof event.address === "string" ? event.address.toLowerCase() : "";
    return (address === collection && COLLECTION_EVENTS.has(event.type)) ||
      (address === market && MARKET_EVENTS.has(event.type));
  }));

  const minted = new Map();
  const owners = new Map();
  const listings = new Map();
  const mintedTransfers = new Set();
  let totalSupply = 0n;

  for (const event of events) {
    const values = eventValues(event);
    if (event.type === "NFTMinted") {
      const tokenId = BigInt(values.tokenId);
      const creator = normalizeAddress(values.creator, "创作者");
      if (tokenId <= 0n || minted.has(tokenId.toString())) {
        throw new Error(`NFT 铸造历史重复或 Token ID 无效: ${tokenId}`);
      }
      minted.set(tokenId.toString(), {
        tokenId: tokenId.toString(),
        creator,
        uri: values.tokenURI,
      });
      if (typeof values.tokenURI !== "string") {
        throw new Error(`Token ${tokenId} 缺少元数据 URI`);
      }
      if (tokenId > totalSupply) totalSupply = tokenId;
      continue;
    }

    if (event.type === "Transfer") {
      const tokenId = BigInt(values.tokenId);
      const key = tokenId.toString();
      const from = normalizeAddress(values.from, "转出方");
      const to = normalizeAddress(values.to, "接收方");
      const currentOwner = owners.get(key);

      if (from === ZERO_ADDRESS) {
        if (currentOwner || to === ZERO_ADDRESS) {
          throw new Error(`Token ${tokenId} 缺少连续的所有权转移记录`);
        }
        owners.set(key, to);
        mintedTransfers.add(key);
      } else {
        if (currentOwner !== from) {
          throw new Error(`Token ${tokenId} 缺少连续的所有权转移记录`);
        }
        if (to === ZERO_ADDRESS) owners.delete(key);
        else owners.set(key, to);
      }
      if (tokenId > totalSupply) totalSupply = tokenId;
      continue;
    }

    if (event.type === "ItemListed") {
      const itemId = BigInt(values.itemId).toString();
      const tokenId = BigInt(values.tokenId).toString();
      const nftContract = normalizeAddress(values.nftContract, "NFT 合约");
      if (nftContract !== collection) continue;
      if (listings.has(itemId)) throw new Error(`市场挂牌历史重复: ${itemId}`);
      listings.set(itemId, {
        tokenId,
        seller: normalizeAddress(values.seller, "卖家"),
        price: BigInt(values.price).toString(),
        listed: true,
      });
      continue;
    }

    const itemId = BigInt(values.itemId).toString();
    const listing = listings.get(itemId);
    if (!listing) continue;
    if (event.type === "ItemSold" || event.type === "ItemCancelled") {
      listing.listed = false;
    } else if (event.type === "PriceUpdated") {
      listing.price = BigInt(values.newPrice).toString();
    }
  }

  const assets = [];
  for (const tokenId of minted.keys()) {
    if (!mintedTransfers.has(tokenId)) {
      throw new Error(`Token ${tokenId} 缺少连续的所有权转移记录`);
    }
  }
  for (const tokenId of mintedTransfers) {
    if (!minted.has(tokenId)) {
      throw new Error(`Token ${tokenId} 缺少连续的铸造元数据记录`);
    }
  }
  for (const [tokenId, owner] of owners) {
    const asset = minted.get(tokenId);
    if (!asset || !asset.uri) {
      throw new Error(`Token ${tokenId} 缺少连续的铸造元数据记录`);
    }
    assets.push({ ...asset, owner });
  }
  assets.sort((left, right) => BigInt(left.tokenId) < BigInt(right.tokenId) ? -1 : 1);

  const activeListings = [];
  for (const listing of listings.values()) {
    if (
      listing.listed &&
      listing.price !== "0" &&
      owners.get(listing.tokenId) === listing.seller
    ) {
      activeListings.push({
        tokenId: listing.tokenId,
        seller: listing.seller,
        price: listing.price,
      });
    }
  }

  return {
    name: null,
    symbol: null,
    assets,
    listings: activeListings,
    totalSupply: totalSupply.toString(),
    feeRecipient: null,
  };
}

async function captureMigrationSnapshot(hre, source) {
  const collectionAddress = source.collectionAddress;
  const marketAddress = source.marketAddress;
  const [collectionCode, marketCode] = await Promise.all([
    hre.ethers.provider.getCode(collectionAddress),
    hre.ethers.provider.getCode(marketAddress),
  ]);
  if (collectionCode === "0x" || marketCode === "0x") {
    throw new Error("旧部署合约地址上没有代码，已中止迁移以避免丢失 NFT");
  }

  const collection = await hre.ethers.getContractAt("NFTCollection", collectionAddress);
  const market = await hre.ethers.getContractAt("NFTMarket", marketAddress);
  const [name, symbol, totalSupply, feeRecipient, listedItems] = await Promise.all([
    collection.name(),
    collection.symbol(),
    collection.totalSupply(),
    market.feeRecipient(),
    market.getListedItems(),
  ]);

  const assets = [];
  for (let tokenId = 1n; tokenId <= totalSupply; tokenId++) {
    let owner;
    try {
      owner = await collection.ownerOf(tokenId);
    } catch (error) {
      if (/owner query for nonexistent token/i.test(error.message || "")) continue;
      throw error;
    }
    const [creator, uri] = await Promise.all([
      collection.creatorOf(tokenId),
      collection.tokenURI(tokenId),
    ]);
    assets.push({
      tokenId: tokenId.toString(),
      owner: owner.toLowerCase(),
      creator: creator.toLowerCase(),
      uri,
    });
  }

  const assetOwners = new Map(assets.map((asset) => [asset.tokenId, asset.owner]));
  const listings = listedItems
    .filter((item) =>
      item.listed &&
      item.nftContract.toLowerCase() === collectionAddress.toLowerCase() &&
      assetOwners.get(item.tokenId.toString()) === item.seller.toLowerCase()
    )
    .map((item) => ({
      tokenId: item.tokenId.toString(),
      seller: item.seller.toLowerCase(),
      price: item.price.toString(),
    }));

  return {
    name,
    symbol,
    assets,
    listings,
    totalSupply: totalSupply.toString(),
    feeRecipient: feeRecipient.toLowerCase(),
  };
}

async function migrateSnapshot(hre, snapshot, collection, market) {
  await (await collection.preserveTokenIdCounter(snapshot.totalSupply)).wait();

  const listedTokens = new Set(snapshot.listings.map((listing) => listing.tokenId));
  const marketAddress = (await market.getAddress()).toLowerCase();
  for (const asset of snapshot.assets) {
    await (await collection.migrateToken(
      asset.tokenId,
      asset.owner,
      asset.uri,
      asset.creator,
      listedTokens.has(asset.tokenId) ? marketAddress : ZERO_ADDRESS
    )).wait();
  }

  const collectionAddress = await collection.getAddress();
  for (const listing of snapshot.listings) {
    await (await market.migrateListing(
      collectionAddress,
      listing.tokenId,
      listing.seller,
      listing.price
    )).wait();
  }

  if (
    snapshot.feeRecipient &&
    snapshot.feeRecipient !== ZERO_ADDRESS &&
    snapshot.feeRecipient !== (await market.feeRecipient()).toLowerCase()
  ) {
    await (await market.setFeeRecipient(snapshot.feeRecipient)).wait();
  }
}

function readHistory(historyPath) {
  if (!fs.existsSync(historyPath)) {
    throw new Error(`找不到用于恢复迁移的事件历史: ${historyPath}`);
  }
  return fs.readFileSync(historyPath, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        throw new Error(`历史记录第 ${index + 1} 行无法解析: ${error.message}`);
      }
    });
}

function deploymentHistoryPath(projectRoot) {
  const dataDirectory = process.env.DATA_DIR
    ? path.resolve(projectRoot, process.env.DATA_DIR)
    : path.join(projectRoot, "backend", "data");
  return path.join(dataDirectory, "history.jsonl");
}

function readDeployments(projectRoot) {
  const contractsDirectory = path.join(projectRoot, "contracts");
  const deploymentsPath = path.join(contractsDirectory, "deployments.json");
  const latestPath = path.join(contractsDirectory, "deploy.json");
  const deployments = fs.existsSync(deploymentsPath)
    ? JSON.parse(fs.readFileSync(deploymentsPath, "utf8"))
    : [];
  if (!Array.isArray(deployments)) throw new Error(`部署档案格式无效: ${deploymentsPath}`);
  if (fs.existsSync(latestPath)) {
    const latest = JSON.parse(fs.readFileSync(latestPath, "utf8"));
    if (latest.deploymentId && !deployments.some((deployment) =>
      deployment.deploymentId === latest.deploymentId
    )) {
      deployments.push(latest);
    }
  }
  return deployments;
}

function deploymentTime(deployment) {
  const timestamp = Date.parse(deployment.timestamp || "");
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

async function resolveMigrationSource(hre, projectRoot) {
  const mode = process.env.NFT_MIGRATION_SOURCE || "auto";
  if (mode === "none") return null;
  if (mode !== "auto" && mode !== "history") {
    throw new Error("NFT_MIGRATION_SOURCE 仅支持 auto、history 或 none");
  }

  if (mode === "auto") {
    const chainId = (await hre.ethers.provider.getNetwork()).chainId.toString();
    const candidates = readDeployments(projectRoot)
      .filter((deployment) =>
        deployment.chainId === chainId &&
        deployment.collectionAddress &&
        deployment.marketAddress
      )
      .sort((left, right) => deploymentTime(right) - deploymentTime(left));

    if (candidates.length === 0) return null;
    const source = candidates[0];
    const [collectionCode, marketCode] = await Promise.all([
      hre.ethers.provider.getCode(source.collectionAddress),
      hre.ethers.provider.getCode(source.marketAddress),
    ]);
    if (collectionCode === "0x" || marketCode === "0x") {
      throw new Error(
        "找到同链旧部署记录，但合约地址上没有代码。请恢复原链，或确认不需要迁移后设置 NFT_MIGRATION_SOURCE=none"
      );
    }
    return source;
  }

  const events = readHistory(deploymentHistoryPath(projectRoot));
  const deploymentGroups = new Map();
  for (const event of events) {
    if (!event.deploymentId || typeof event.address !== "string") continue;
    if (!deploymentGroups.has(event.deploymentId)) deploymentGroups.set(event.deploymentId, []);
    deploymentGroups.get(event.deploymentId).push(event);
  }

  const candidates = [];
  for (const [deploymentId, groupEvents] of deploymentGroups) {
    const hasCollectionEvents = groupEvents.some((event) => COLLECTION_EVENTS.has(event.type));
    const hasMarketEvents = groupEvents.some((event) => MARKET_EVENTS.has(event.type));
    if (!hasCollectionEvents || !hasMarketEvents) continue;
    const deployments = readDeployments(projectRoot).filter((deployment) =>
      deployment.deploymentId === deploymentId
    );
    for (const deployment of deployments) candidates.push({ deployment, events: groupEvents });
  }

  if (candidates.length === 0) {
    throw new Error("事件历史中没有可唯一识别的完整 NFT 与市场部署记录");
  }
  const latestTime = Math.max(...candidates.map(({ events }) =>
    Math.max(...events.map((event) => Number(event.timestamp) || 0))
  ));
  const latest = candidates.filter(({ events }) =>
    Math.max(...events.map((event) => Number(event.timestamp) || 0)) === latestTime
  );
  if (latest.length !== 1) {
    throw new Error("事件历史中存在多个无法唯一判定的部署，请保留单一部署历史后重试");
  }

  return { ...latest[0].deployment, historyEvents: latest[0].events };
}

module.exports = {
  captureHistorySnapshot,
  captureMigrationSnapshot,
  migrateSnapshot,
  resolveMigrationSource,
};
