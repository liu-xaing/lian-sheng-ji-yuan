/**
 * 区块链事件监听服务
 * 监听 NFTCollection 和 NFTMarket 合约事件
 * 维护链下索引，加速前端查询
 */
const { Web3 } = require("web3");
const persistentStore = require("./persistentStore");

class BlockchainService {
  constructor() {
    this.web3 = null;
    this.nftCollection = null;
    this.nftMarket = null;
    this.history = persistentStore.history;
    this.events = this.history.slice(-2000);
    this.marketItems = new Map(); // 市场条目缓存
    this.collectionAddress = null;
    this.marketAddress = null;
    this.historySyncPromise = Promise.resolve();
    this.historySyncError = null;
  }

  /**
   * 初始化 Web3 连接并绑定合约
   */
  async init(rpcUrl, collectionABI, collectionAddr, marketABI, marketAddr) {
    // Web3.js v4: 使用 new Web3(url) 创建实例
    this.web3 = new Web3(rpcUrl);

    this.nftCollection = new this.web3.eth.Contract(collectionABI, collectionAddr);
    this.nftMarket = new this.web3.eth.Contract(marketABI, marketAddr);
    this.collectionAddress = collectionAddr.toLowerCase();
    this.marketAddress = marketAddr.toLowerCase();
    this.deploymentId = process.env.DEPLOYMENT_ID ||
      `${await this.web3.eth.getChainId()}:${this.collectionAddress}:${this.marketAddress}`;
    persistentStore.migrateLegacyHistory(
      this.collectionAddress,
      this.marketAddress,
      this.deploymentId
    );
    this.events = this.history.slice(-2000);

    console.log("🔗 区块链服务已连接");
    console.log("   NFTCollection:", collectionAddr);
    console.log("   NFTMarket:    ", marketAddr);

    this._setupListeners();
    this.historySyncPromise = this._syncHistoricalEvents().catch((error) => {
      this.historySyncError = error;
      console.error("历史事件回填失败:", error);
    });
    await this.historySyncPromise;
  }

  waitForHistorySync() {
    return this.historySyncPromise.then(() => {
      if (this.historySyncError) throw this.historySyncError;
    });
  }

  async _syncHistoricalEvents() {
    if (!this.web3 || !this.nftCollection || !this.nftMarket) return;

    const fromBlock = BigInt(process.env.HISTORY_FROM_BLOCK || "0");
    const latestBlock = BigInt(await this.web3.eth.getBlockNumber());
    const blockRange = BigInt(process.env.HISTORY_BLOCK_RANGE || "2000");
    if (fromBlock < 0n || blockRange <= 0n) {
      throw new Error("HISTORY_FROM_BLOCK must be non-negative and HISTORY_BLOCK_RANGE must be positive");
    }

    const collectionEvents = ["NFTMinted", "Transfer"].map((name) => [this.nftCollection, name]);
    const marketEvents = ["ItemListed", "ItemSold", "ItemCancelled", "PriceUpdated"]
      .map((name) => [this.nftMarket, name]);
    const eventSources = [...collectionEvents, ...marketEvents];
    const historicalEvents = [];

    for (let start = fromBlock; start <= latestBlock; start += blockRange) {
      const end = start + blockRange - 1n < latestBlock
        ? start + blockRange - 1n
        : latestBlock;
      const batches = await Promise.all(eventSources.map(async ([contract, eventName]) => {
        const events = await contract.getPastEvents(eventName, {
          fromBlock: start.toString(),
          toBlock: end.toString(),
        });
        return events.map((event) => ({ type: eventName, event }));
      }));
      historicalEvents.push(...batches.flat());
    }

    historicalEvents.sort((a, b) => {
      const blockDifference = BigInt(a.event.blockNumber) - BigInt(b.event.blockNumber);
      if (blockDifference !== 0n) return blockDifference < 0n ? -1 : 1;
      const aLogIndex = BigInt(a.event.logIndex || 0);
      const bLogIndex = BigInt(b.event.logIndex || 0);
      return aLogIndex < bLogIndex ? -1 : aLogIndex > bLogIndex ? 1 : 0;
    });

    const blockTimestamps = new Map();
    for (const { type, event } of historicalEvents) {
      let eventToRecord = event;
      let timestamp = blockTimestamps.get(event.blockNumber);
      if (timestamp === undefined) {
        const block = await this.web3.eth.getBlock(event.blockNumber);
        timestamp = Number(block.timestamp) * 1000;
        blockTimestamps.set(event.blockNumber, timestamp);
      }

      if (type === "ItemListed") {
        const { itemId, tokenId, nftContract, seller, price } = event.returnValues;
        this.marketItems.set(`${nftContract}-${tokenId}`, {
          itemId, tokenId, nftContract, seller, price, listed: true, timestamp,
        });
      } else if (type === "ItemSold" || type === "ItemCancelled") {
        const itemId = event.returnValues.itemId.toString();
        for (const item of this.marketItems.values()) {
          if (item.itemId.toString() === itemId) item.listed = false;
        }
      } else if (type === "PriceUpdated") {
        try {
          const item = await this.nftMarket.methods.items(event.returnValues.itemId).call();
          const marketItem = this.marketItems.get(`${item.nftContract}-${item.tokenId}`);
          if (marketItem) marketItem.price = event.returnValues.newPrice.toString();
          eventToRecord = {
            ...event,
            returnValues: {
              ...event.returnValues,
              tokenId: item.tokenId.toString(),
              seller: item.seller,
            },
          };
        } catch (error) {
          console.error("历史价格事件详情读取失败:", error.message);
          continue;
        }
      }

      this._recordEvent(type, eventToRecord, timestamp);
    }

    console.log(`📚 历史事件同步完成: ${historicalEvents.length} 条 (区块 ${fromBlock}-${latestBlock})`);
  }

  /**
   * 设置事件监听器
   */
  _setupListeners() {
    // 监听 NFT 铸造事件
    this._listenToEvent(this.nftCollection.events.NFTMinted(), "NFTMinted", (event) => {
      console.log("🎨 新 NFT 铸造:", {
        creator: event.returnValues.creator,
        tokenId: event.returnValues.tokenId,
        txHash: event.transactionHash,
      });
      this._recordEvent("NFTMinted", event);
    });

    // 监听 NFT 转移事件
    this._listenToEvent(this.nftCollection.events.Transfer(), "Transfer", (event) => {
      console.log("🔄 NFT 转移:", {
        from: event.returnValues.from,
        to: event.returnValues.to,
        tokenId: event.returnValues.tokenId,
      });
      this._recordEvent("Transfer", event);
    });

    // 监听市场上架事件
    this._listenToEvent(this.nftMarket.events.ItemListed(), "ItemListed", (event) => {
      const { itemId, tokenId, nftContract, seller, price } = event.returnValues;
      console.log("📋 NFT 上架市场:", { itemId: itemId.toString(), tokenId: tokenId.toString(), price });
      this.marketItems.set(`${nftContract}-${tokenId}`, {
        itemId, tokenId, nftContract, seller, price,
        listed: true,
        timestamp: Date.now(),
      });
      this._recordEvent("ItemListed", event);
    });

    // 监听市场售出事件
    this._listenToEvent(this.nftMarket.events.ItemSold(), "ItemSold", (event) => {
      const { itemId, tokenId, seller, buyer, price } = event.returnValues;
      console.log("💰 NFT 售出:", { itemId: itemId.toString(), tokenId: tokenId.toString(), buyer, price });
      for (const item of this.marketItems.values()) {
        if (item.tokenId.toString() === tokenId.toString()) {
          item.listed = false;
        }
      }
      this._recordEvent("ItemSold", event);
    });

    // 监听取消上架事件
    this._listenToEvent(this.nftMarket.events.ItemCancelled(), "ItemCancelled", (event) => {
      console.log("❌ 上架已取消:", { itemId: event.returnValues.itemId.toString() });
      for (const item of this.marketItems.values()) {
        if (item.itemId.toString() === event.returnValues.itemId.toString()) {
          item.listed = false;
        }
      }
      this._recordEvent("ItemCancelled", event);
    });

    this._listenToEvent(this.nftMarket.events.PriceUpdated(), "PriceUpdated", async (event) => {
      const itemId = event.returnValues.itemId.toString();
      try {
        const item = await this.nftMarket.methods.items(itemId).call();
        const marketItem = this.marketItems.get(`${item.nftContract}-${item.tokenId}`);
        if (marketItem) marketItem.price = event.returnValues.newPrice.toString();
        this._recordEvent("PriceUpdated", {
          ...event,
          returnValues: {
            ...event.returnValues,
            tokenId: item.tokenId.toString(),
            seller: item.seller,
          },
        });
      } catch (error) {
        console.error("PriceUpdated 事件详情读取失败:", error.message);
      }
    });

    console.log("👂 事件监听器已启动");
  }

  _listenToEvent(subscription, eventName, onData) {
    subscription.on("data", onData);
    subscription.on("error", (err) => console.error(`${eventName} 事件监听错误:`, err.message));
  }

  _recordEvent(type, event, timestamp = Date.now()) {
    const values = Object.fromEntries(
      Object.entries(event.returnValues).map(([key, value]) => [
        key,
        value === null || value === undefined ? value : value.toString(),
      ])
    );
    const record = {
      type,
      values,
      txHash: event.transactionHash,
      blockNumber: event.blockNumber?.toString() || "",
      logIndex: event.logIndex?.toString(),
      address: event.address || "",
      deploymentId: this.deploymentId,
      timestamp,
    };
    if (!persistentStore.recordHistory(record)) return;
    this.events.push(record);
    if (this.events.length > 2000) this.events.shift();
  }

  /**
   * 获取所有市场事件
   */
  getEvents() {
    return this.events;
  }

  /**
   * 获取市场条目缓存
   */
  getMarketItems() {
    return Array.from(this.marketItems.values());
  }

  getAccountHistory(address) {
    const normalizedAddress = address.toLowerCase();
    const saleTransactions = new Set(
      this.history
        .filter((event) => event.type === "ItemSold")
        .map((event) => `${event.txHash}-${event.values.tokenId}`)
    );

    return this.history
      .flatMap((event) => {
        const values = event.values;
        const tokenId = values.tokenId;
        if (event.type === "NFTMinted" && values.creator.toLowerCase() === normalizedAddress) {
          return [{ ...event, action: "minted", tokenId, price: null }];
        }
        if (event.type === "ItemListed" && values.seller.toLowerCase() === normalizedAddress) {
          return [{ ...event, action: "listed", tokenId, price: values.price }];
        }
        if (event.type === "ItemSold") {
          if (values.seller.toLowerCase() === normalizedAddress) {
            return [{ ...event, action: "sold", tokenId, price: values.price }];
          }
          if (values.buyer.toLowerCase() === normalizedAddress) {
            return [{ ...event, action: "bought", tokenId, price: values.price }];
          }
        }
        if (event.type === "ItemCancelled" && values.seller.toLowerCase() === normalizedAddress) {
          return [{ ...event, action: "cancelled", tokenId, price: null }];
        }
        if (event.type === "PriceUpdated" && values.seller?.toLowerCase() === normalizedAddress) {
          return [{ ...event, action: "priceUpdated", tokenId, price: values.newPrice }];
        }
        if (event.type === "Transfer") {
          const from = values.from.toLowerCase();
          const to = values.to.toLowerCase();
          const isMintOrBurn = from === "0x0000000000000000000000000000000000000000" ||
            to === "0x0000000000000000000000000000000000000000";
          const isSaleTransfer = saleTransactions.has(`${event.txHash}-${tokenId}`);
          if (!isMintOrBurn && !isSaleTransfer && (from === normalizedAddress || to === normalizedAddress)) {
            return [{
              ...event,
              action: from === normalizedAddress ? "transferred" : "received",
              tokenId,
              price: null,
            }];
          }
        }
        return [];
      })
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  getTokenHistory(tokenId) {
    const soldTransactions = new Set(
      this.history
        .filter((event) => event.type === "ItemSold" && event.values.tokenId === tokenId)
        .map((event) => event.txHash)
    );
    return this.history
      .filter((event) => {
        if (event.values.tokenId !== tokenId) return false;
        if (event.type !== "Transfer") return true;
        const from = event.values.from.toLowerCase();
        const to = event.values.to.toLowerCase();
        return from !== "0x0000000000000000000000000000000000000000" &&
          to !== "0x0000000000000000000000000000000000000000" &&
          !soldTransactions.has(event.txHash);
      })
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * 关闭连接
   */
  async close() {
    if (this.web3 && this.web3.currentProvider) {
      this.web3.currentProvider.disconnect();
      console.log("🔌 区块链服务连接已关闭");
    }
  }
}

module.exports = new BlockchainService();
