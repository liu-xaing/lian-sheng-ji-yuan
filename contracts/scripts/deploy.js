/**
 * 部署脚本：部署 NFTCollection 和 NFTMarket 合约
 * 
 * 使用方式：
 *   npx hardhat run scripts/deploy.js --network ganache
 */
const path = require("path");
const { persistDeployment } = require("./deploymentFiles");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("========================================");
  console.log("🚀 开始部署合约...");
  console.log("📋 部署账户:", deployer.address);
  console.log("💰 账户余额:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH");
  console.log("========================================\n");

  // 1. 部署 NFTCollection 合约
  console.log("📦 正在部署 NFTCollection 合约...");
  const NFTCollection = await ethers.getContractFactory("NFTCollection");
  const nftCollection = await NFTCollection.deploy("链生纪元", "LSE");
  await nftCollection.waitForDeployment();
  const collectionAddr = await nftCollection.getAddress();
  console.log("✅ NFTCollection 已部署至:", collectionAddr);

  // 2. 部署 NFTMarket 合约
  console.log("\n📦 正在部署 NFTMarket 合约...");
  const NFTMarket = await ethers.getContractFactory("NFTMarket");
  const nftMarket = await NFTMarket.deploy();
  await nftMarket.waitForDeployment();
  const marketAddr = await nftMarket.getAddress();
  console.log("✅ NFTMarket 已部署至:", marketAddr);

  // 3. Persist deployment history and synchronize application addresses.
  const projectRoot = path.resolve(__dirname, "../..");
  const network = await ethers.provider.getNetwork();
  const deploymentId = `${network.chainId}:${collectionAddr.toLowerCase()}:${marketAddr.toLowerCase()}:${Date.now()}`;
  const deployInfo = {
    deploymentId,
    network: hre.network.name,
    chainId: network.chainId.toString(),
    collectionAddress: collectionAddr,
    marketAddress: marketAddr,
    deployer: deployer.address,
    blockNumber: (await ethers.provider.getBlockNumber()).toString(),
    timestamp: new Date().toISOString(),
  };
  const deploymentCount = persistDeployment(deployInfo, projectRoot);

  // 4. Output deployment summary.
  console.log("\n========================================");
  console.log("🎉 部署完成！");
  console.log("========================================");
  console.log("📋 合约地址:");
  console.log("   NFTCollection:", collectionAddr);
  console.log("   NFTMarket:    ", marketAddr);
  console.log("========================================");
  console.log("\n✅ 前端和后端合约地址已自动更新");
  console.log(`📄 当前部署已写入 deploy.json；共保留 ${deploymentCount} 条部署记录 (deployments.json)`);
}

main().catch((error) => {
  console.error("❌ 部署失败:", error);
  process.exitCode = 1;
});
