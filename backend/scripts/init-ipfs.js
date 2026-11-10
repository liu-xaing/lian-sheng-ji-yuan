/**
 * IPFS 初始化脚本
 * 上传示例 NFT 元数据到 IPFS（用于 Demo 演示）
 * 
 * 使用方式：
 *   node scripts/init-ipfs.js
 */
const axios = require("axios");
const FormData = require("form-data");
require("dotenv").config();

const PINATA_API_KEY = process.env.PINATA_API_KEY;
const PINATA_SECRET_KEY = process.env.PINATA_SECRET_KEY;

// 示例 NFT 元数据
const sampleNFTs = [
  {
    name: "链生纪元 · 创世之作",
    description: "链生纪元平台的第一个 NFT，标志着去中心化数字确权时代的开始。",
    image: "https://via.placeholder.com/500x500/667eea/ffffff?text=Genesis+NFT",
    attributes: [
      { trait_type: "稀有度", value: "传说" },
      { trait_type: "系列", value: "创世" },
      { trait_type: "编号", value: "001" },
    ],
  },
  {
    name: "链生纪元 · 数字之光",
    description: "照亮区块链世界的光芒，每一道光线都代表着一次不可篡改的交易。",
    image: "https://via.placeholder.com/500x500/764ba2/ffffff?text=Digital+Light",
    attributes: [
      { trait_type: "稀有度", value: "史诗" },
      { trait_type: "系列", value: "光影" },
      { trait_type: "编号", value: "002" },
    ],
  },
  {
    name: "链生纪元 · 永恒之链",
    description: "象征着区块链的永恒与不可逆转，链接过去与未来的数字纽带。",
    image: "https://via.placeholder.com/500x500/f093fb/ffffff?text=Eternal+Chain",
    attributes: [
      { trait_type: "稀有度", value: "稀有" },
      { trait_type: "系列", value: "永恒" },
      { trait_type: "编号", value: "003" },
    ],
  },
];

async function uploadToPinata(data) {
  const url = "https://api.pinata.cloud/pinning/pinJSONToIPFS";
  const formData = {
    pinataContent: data,
    pinataMetadata: { name: data.name },
  };

  const response = await axios.post(url, formData, {
    headers: {
      pinata_api_key: PINATA_API_KEY,
      pinata_secret_api_key: PINATA_SECRET_KEY,
      "Content-Type": "application/json",
    },
  });

  return response.data.IpfsHash;
}

async function main() {
  console.log("========================================");
  console.log("📤 开始上传示例 NFT 元数据到 IPFS...");
  console.log("========================================\n");

  if (!PINATA_API_KEY || !PINATA_SECRET_KEY) {
    console.log("⚠️  未配置 Pinata API Key，使用模拟模式...\n");
    console.log("示例 NFT 元数据（模拟上传）：");
    sampleNFTs.forEach((nft, i) => {
      const mockHash = `QmSim${Date.now()}${i}`;
      console.log(`  [${i + 1}] ${nft.name}`);
      console.log(`      IPFS URI: ipfs://${mockHash}`);
      console.log(`      Gateway:  https://gateway.pinata.cloud/ipfs/${mockHash}`);
    });
    console.log("\n💡 请配置 .env 中的 PINATA_API_KEY 和 PINATA_SECRET_KEY 以使用真实 IPFS");
    return;
  }

  const results = [];
  for (const nft of sampleNFTs) {
    try {
      const hash = await uploadToPinata(nft);
      results.push({ ...nft, hash });
      console.log(`✅ 已上传: ${nft.name}`);
      console.log(`   IPFS Hash: ${hash}`);
      console.log(`   URI: ipfs://${hash}\n`);
    } catch (error) {
      console.error(`❌ 上传失败: ${nft.name}`, error.message);
    }
  }

  console.log("========================================");
  console.log(`📊 上传完成: ${results.length}/${sampleNFTs.length}`);
  console.log("========================================");
  console.log("\n📋 IPFS Hash 列表（用于合约铸造）：");
  results.forEach((r) => {
    console.log(`  ${r.name}: ipfs://${r.hash}`);
  });
}

main().catch(console.error);
