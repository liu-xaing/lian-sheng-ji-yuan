/**
 * 链下服务层 - Express 后端服务
 * 
 * 职责：
 *   1. 提供 REST API 供前端查询市场数据
 *   2. 管理 IPFS 元数据存储
 *   3. 监听区块链事件，维护链下索引
 *   4. 提供合约 ABI 给前端
 */
const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
require("dotenv").config();

const ipfsService = require("./services/ipfs");
const blockchainService = require("./services/blockchain");
const persistentStore = require("./services/persistentStore");

const app = express();
const PORT = process.env.PORT || 3001;
const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, callback) => {
    const allowedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    if (!allowedTypes.includes(file.mimetype)) {
      callback(new Error("仅支持 JPEG、PNG、GIF 或 WebP 图片"));
      return;
    }
    callback(null, true);
  },
});

// ============ 中间件 ============
app.use(cors());
app.use(express.json({ limit: "10mb" }));

// ============ 合约配置（部署后更新） ============
const CONFIG = {
  NFT_COLLECTION_ADDRESS: process.env.NFT_COLLECTION_ADDRESS || "0x5FbDB2315678afecb367f032d93F642f64180aa3",
  NFT_MARKET_ADDRESS: process.env.NFT_MARKET_ADDRESS || "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
  RPC_URL: process.env.RPC_URL || "http://127.0.0.1:7545",
  WS_URL: process.env.WS_URL || "ws://127.0.0.1:7545",
};

// ============ 加载合约 ABI ============
let collectionABI = [];
let marketABI = [];

try {
  const collectionArtifact = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, "../../contracts/artifacts/contracts/NFTCollection.sol/NFTCollection.json"),
      "utf-8"
    )
  );
  collectionABI = collectionArtifact.abi;
} catch (e) {
  console.warn("⚠️  未找到 NFTCollection ABI，请先编译合约: cd contracts && npx hardhat compile");
}

try {
  const marketArtifact = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, "../../contracts/artifacts/contracts/NFTMarket.sol/NFTMarket.json"),
      "utf-8"
    )
  );
  marketABI = marketArtifact.abi;
} catch (e) {
  console.warn("⚠️  未找到 NFTMarket ABI，请先编译合约: cd contracts && npx hardhat compile");
}

// ============ API 路由 ============

/**
 * GET /api/health
 * 健康检查
 */
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    service: "链生纪元 - NFT 市场后端",
    timestamp: new Date().toISOString(),
    contracts: {
      collection: CONFIG.NFT_COLLECTION_ADDRESS,
      market: CONFIG.NFT_MARKET_ADDRESS,
    },
  });
});

/**
 * GET /api/contracts
 * 返回合约地址和 ABI（供前端使用）
 */
app.get("/api/contracts", (req, res) => {
  res.json({
    collection: {
      address: CONFIG.NFT_COLLECTION_ADDRESS,
      abi: collectionABI,
    },
    market: {
      address: CONFIG.NFT_MARKET_ADDRESS,
      abi: marketABI,
    },
  });
});

/**
 * POST /api/ipfs/upload
 * 上传 NFT 元数据到 IPFS
 * Body: { name, description, image, attributes }
 */
app.post("/api/ipfs/upload", async (req, res) => {
  try {
    const { name, description, image, attributes } = req.body;

    if (!name || !description) {
      return res.status(400).json({ error: "名称和描述为必填项" });
    }

    const metadata = ipfsService.createMetadata({ name, description, image, attributes });
    const hash = await ipfsService.uploadJSON(metadata);

    res.json({
      success: true,
      hash,
      uri: `ipfs://${hash}`,
      gatewayUrl: `${ipfsService.gateway}${hash}`,
      metadata,
    });
  } catch (error) {
    console.error("上传失败:", error);
    res.status(500).json({ error: "上传失败: " + error.message });
  }
});

/**
 * POST /api/ipfs/upload-image
 * 接收 multipart/form-data 的 image 文件并上传到 Pinata
 */
app.post(
  "/api/ipfs/upload-image",
  (req, res, next) => {
    imageUpload.single("image")(req, res, (error) => {
      if (error) return res.status(400).json({ error: error.message });
      next();
    });
  },
  async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "请选择图片文件" });

    const signatures = [
      { type: "image/jpeg", bytes: [0xff, 0xd8, 0xff] },
      { type: "image/png", bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
      { type: "image/gif", bytes: [0x47, 0x49, 0x46, 0x38] },
      { type: "image/webp", bytes: [0x52, 0x49, 0x46, 0x46] },
    ];
    const signature = signatures.find(({ type, bytes }) =>
      type === req.file.mimetype &&
      bytes.every((byte, index) => req.file.buffer[index] === byte)
    );
    if (!signature || (signature.type === "image/webp" && req.file.buffer.toString("ascii", 8, 12) !== "WEBP")) {
      return res.status(400).json({ error: "文件内容与图片格式不匹配" });
    }

    try {
      const hash = await ipfsService.uploadFile(
        req.file.buffer,
        req.file.originalname,
        req.file.mimetype
      );
      res.json({ success: true, hash, uri: `ipfs://${hash}` });
    } catch (error) {
      console.error("图片上传失败:", error);
      res.status(502).json({ error: `图片上传失败: ${error.message}` });
    }
  }
);

/**
 * GET /api/ipfs/:hash
 * 从 IPFS 获取元数据（带缓存）
 */
// 简单的内存缓存
const ipfsCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5分钟缓存
const TOKEN_ID_PATTERN = /^[1-9]\d*$/;
const ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;

app.get("/api/ipfs/:hash", async (req, res) => {
  try {
    const hash = req.params.hash;
    
    // 检查缓存
    const cached = ipfsCache.get(hash);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      console.log(`✅ 使用缓存数据: ${hash}`);
      return res.json(cached.data);
    }
    
    // 从 IPFS 读取
    const data = await ipfsService.getJSON(hash);
    if (data) {
      // 存入缓存
      ipfsCache.set(hash, {
        data,
        timestamp: Date.now()
      });
      res.json(data);
    } else {
      res.status(404).json({ error: "未找到数据" });
    }
  } catch (error) {
    res.status(500).json({ error: "读取失败: " + error.message });
  }
});

/**
 * GET /api/ipfs/image/:cid
 * 通过后端读取 IPFS 图片，避免浏览器无法直连 IPFS 网关
 */
app.get("/api/ipfs/image/:cid", async (req, res) => {
  const { cid } = req.params;
  if (!/^(?:Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z2-7]{20,})$/i.test(cid)) {
    return res.status(400).json({ error: "无效的 IPFS CID" });
  }

  try {
    const file = await ipfsService.getFile(cid);
    res.set("Content-Type", file.contentType);
    res.set("Cache-Control", "public, max-age=300");
    res.send(file.data);
  } catch (error) {
    console.error(`IPFS 图片读取失败 (${cid}):`, error.message);
    res.status(502).json({ error: error.message });
  }
});

/**
 * POST /api/nft/:tokenId/favorite
 * 使用 { address } 切换指定钱包对 NFT 的持久化收藏状态
 */
app.post("/api/nft/:tokenId/favorite", (req, res) => {
  const { tokenId } = req.params;
  const { address } = req.body || {};
  if (!TOKEN_ID_PATTERN.test(tokenId)) {
    return res.status(400).json({ error: "无效的 Token ID" });
  }
  if (typeof address !== "string" || !ADDRESS_PATTERN.test(address)) {
    return res.status(400).json({ error: "请提供有效的钱包地址" });
  }

  try {
    res.json(persistentStore.toggleFavorite(tokenId, address.toLowerCase()));
  } catch (error) {
    console.error("保存 NFT 收藏状态失败:", error);
    res.status(500).json({ error: "保存收藏状态失败" });
  }
});

/**
 * GET /api/nft/:tokenId/favorite-count
 * 返回收藏数；传 address 时同时返回当前钱包是否已收藏
 */
app.get("/api/nft/:tokenId/favorite-count", (req, res) => {
  const { tokenId } = req.params;
  const { address } = req.query;
  if (!TOKEN_ID_PATTERN.test(tokenId)) {
    return res.status(400).json({ error: "无效的 Token ID" });
  }
  if (address !== undefined && (typeof address !== "string" || !ADDRESS_PATTERN.test(address))) {
    return res.status(400).json({ error: "无效的钱包地址" });
  }

  res.json(persistentStore.getFavoriteState(
    tokenId,
    typeof address === "string" ? address.toLowerCase() : undefined
  ));
});

/**
 * GET /api/events
 * 获取区块链事件记录
 */
app.get("/api/events", (req, res) => {
  const events = blockchainService.getEvents();
  res.json({ events, total: events.length });
});

/**
 * GET /api/history/account?address=0x...
 * 返回该钱包的链上活动（本地持久化并在启动时从链上回填）
 */
app.get("/api/history/account", async (req, res) => {
  const { address } = req.query;
  if (typeof address !== "string" || !ADDRESS_PATTERN.test(address)) {
    return res.status(400).json({ error: "请提供有效的钱包地址" });
  }
  try {
    await blockchainService.waitForHistorySync();
    const history = blockchainService.getAccountHistory(address);
    res.json({ address, history, total: history.length });
  } catch (error) {
    res.status(503).json({ error: `链上历史同步失败: ${error.message}` });
  }
});

/**
 * GET /api/history/token/:tokenId
 * 返回本地持久化的 NFT 相关事件
 */
app.get("/api/history/token/:tokenId", async (req, res) => {
  const { tokenId } = req.params;
  if (!TOKEN_ID_PATTERN.test(tokenId)) {
    return res.status(400).json({ error: "无效的 Token ID" });
  }
  try {
    await blockchainService.waitForHistorySync();
    const history = blockchainService.getTokenHistory(tokenId);
    res.json({ tokenId, history, total: history.length });
  } catch (error) {
    res.status(503).json({ error: `链上历史同步失败: ${error.message}` });
  }
});

/**
 * GET /api/market/items
 * 获取市场条目缓存
 */
app.get("/api/market/items", (req, res) => {
  const items = blockchainService.getMarketItems();
  res.json({ items, total: items.length });
});

// ============ 启动服务 ============
app.listen(PORT, async () => {
  console.log("========================================");
  console.log("🚀 链生纪元 - 链下服务已启动");
  console.log(`📡 服务地址: http://localhost:${PORT}`);
  console.log("========================================");
  console.log("📋 API 端点:");
  console.log("   GET  /api/health       - 健康检查");
  console.log("   GET  /api/contracts    - 合约信息");
  console.log("   POST /api/ipfs/upload  - 上传元数据");
  console.log("   GET  /api/ipfs/:hash   - 获取元数据");
  console.log("   POST /api/nft/:tokenId/favorite - 收藏/取消收藏");
  console.log("   GET  /api/history/account - 钱包交易历史");
  console.log("   GET  /api/history/token/:tokenId - NFT 活动历史");
  console.log("   GET  /api/events       - 事件记录");
  console.log("   GET  /api/market/items - 市场条目");
  console.log("========================================");

  // 初始化区块链事件监听（仅在合约地址已配置时）
  if (
    CONFIG.NFT_COLLECTION_ADDRESS !== "0x0000000000000000000000000000000000000000" &&
    collectionABI.length > 0 &&
    marketABI.length > 0
  ) {
    try {
      await blockchainService.init(
        CONFIG.WS_URL,
        collectionABI,
        CONFIG.NFT_COLLECTION_ADDRESS,
        marketABI,
        CONFIG.NFT_MARKET_ADDRESS
      );
    } catch (err) {
      console.warn("⚠️  区块链事件监听初始化失败（可稍后重试）:", err.message);
    }
  } else {
    console.log("ℹ️  合约地址未配置，事件监听未启动");
    console.log("   请更新 .env 文件中的合约地址后重启服务");
  }
});

module.exports = app;
