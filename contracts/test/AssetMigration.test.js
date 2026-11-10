const { expect } = require("chai");
const hre = require("hardhat");
const { ethers } = hre;
const {
  captureHistorySnapshot,
  captureMigrationSnapshot,
  migrateSnapshot,
} = require("../scripts/migrateAssets");

describe("合约重新部署资产迁移", function () {
  it("保留现有 Token ID、所有者、创作者、元数据和有效挂牌", async function () {
    const [admin, creator, seller, buyer] = await ethers.getSigners();
    const NFTCollection = await ethers.getContractFactory("NFTCollection");
    const sourceCollection = await NFTCollection.deploy("链生纪元", "LSE");
    await sourceCollection.waitForDeployment();

    const NFTMarket = await ethers.getContractFactory("NFTMarket");
    const sourceMarket = await NFTMarket.deploy();
    await sourceMarket.waitForDeployment();

    await sourceCollection.connect(creator).mint(seller.address, "ipfs://asset-one");
    await sourceCollection.connect(creator).mint(seller.address, "ipfs://burned");
    await sourceCollection.connect(seller).burn(2);
    await sourceCollection.connect(creator).mint(buyer.address, "ipfs://asset-three");
    await sourceCollection.connect(seller).approve(await sourceMarket.getAddress(), 1);
    await sourceMarket.connect(seller).listItem(
      await sourceCollection.getAddress(),
      1,
      ethers.parseEther("2")
    );

    const source = {
      collectionAddress: await sourceCollection.getAddress(),
      marketAddress: await sourceMarket.getAddress(),
    };
    const snapshot = await captureMigrationSnapshot(hre, source);
    expect(snapshot.assets.map((asset) => asset.tokenId)).to.deep.equal(["1", "3"]);
    expect(snapshot.listings).to.have.length(1);
    expect(snapshot.totalSupply).to.equal("3");

    const newCollection = await NFTCollection.deploy("链生纪元", "LSE");
    await newCollection.waitForDeployment();
    const newMarket = await NFTMarket.deploy();
    await newMarket.waitForDeployment();
    await migrateSnapshot(hre, snapshot, newCollection, newMarket);

    expect(await newCollection.ownerOf(1)).to.equal(seller.address);
    expect(await newCollection.creatorOf(1)).to.equal(creator.address);
    expect(await newCollection.tokenURI(1)).to.equal("ipfs://asset-one");
    expect(await newCollection.ownerOf(3)).to.equal(buyer.address);
    expect(await newCollection.tokensOfOwner(seller.address)).to.deep.equal([1n]);
    expect(await newCollection.tokensOfOwner(buyer.address)).to.deep.equal([3n]);

    const listings = await newMarket.getListedItems();
    expect(listings).to.have.length(1);
    expect(listings[0].tokenId).to.equal(1n);
    expect(listings[0].seller).to.equal(seller.address);
    expect(listings[0].price).to.equal(ethers.parseEther("2"));

    await newMarket.connect(buyer).buyItem(
      await newCollection.getAddress(),
      1,
      { value: ethers.parseEther("2") }
    );
    expect(await newCollection.ownerOf(1)).to.equal(buyer.address);

    await newCollection.finalizeMigration();
    await newMarket.finalizeMigration();
    await expect(
      newCollection.migrateToken(99, seller.address, "ipfs://forged", creator.address, ethers.ZeroAddress)
    ).to.be.revertedWith("NFTCollection: migration finalized");
    await expect(
      newMarket.migrateListing(await newCollection.getAddress(), 3, buyer.address, 1)
    ).to.be.revertedWith("NFTMarket: migration finalized");

    await newCollection.mint(admin.address, "ipfs://new-token");
    expect(await newCollection.ownerOf(4)).to.equal(admin.address);
  });

  it("从后端事件历史恢复存续资产、最终所有者和有效挂牌", async function () {
    const collectionAddress = "0x0000000000000000000000000000000000000001";
    const marketAddress = "0x0000000000000000000000000000000000000002";
    const zeroAddress = "0x0000000000000000000000000000000000000000";
    const creator = "0x0000000000000000000000000000000000000003";
    const seller = "0x0000000000000000000000000000000000000004";
    const buyer = "0x0000000000000000000000000000000000000005";
    const event = (type, address, blockNumber, logIndex, values) => ({
      type,
      address,
      blockNumber: String(blockNumber),
      logIndex: String(logIndex),
      values,
    });
    const historyEvents = [
      event("Transfer", collectionAddress, 1, 0, { from: zeroAddress, to: seller, tokenId: "1" }),
      event("NFTMinted", collectionAddress, 1, 1, {
        creator, tokenId: "1", tokenURI: "ipfs://one",
      }),
      event("Transfer", collectionAddress, 2, 0, { from: zeroAddress, to: seller, tokenId: "2" }),
      event("NFTMinted", collectionAddress, 2, 1, {
        creator, tokenId: "2", tokenURI: "ipfs://burned",
      }),
      event("Transfer", collectionAddress, 3, 0, { from: seller, to: zeroAddress, tokenId: "2" }),
      event("Transfer", collectionAddress, 4, 0, { from: zeroAddress, to: seller, tokenId: "3" }),
      event("NFTMinted", collectionAddress, 4, 1, {
        creator, tokenId: "3", tokenURI: "ipfs://three",
      }),
      event("Transfer", collectionAddress, 5, 0, { from: seller, to: buyer, tokenId: "3" }),
      event("ItemListed", marketAddress, 6, 0, {
        itemId: "1", tokenId: "1", nftContract: collectionAddress, seller, price: "200",
      }),
      event("PriceUpdated", marketAddress, 7, 0, { itemId: "1", newPrice: "300" }),
      event("ItemListed", marketAddress, 8, 0, {
        itemId: "2", tokenId: "3", nftContract: collectionAddress, seller: buyer, price: "400",
      }),
      event("ItemSold", marketAddress, 9, 0, { itemId: "2" }),
    ];

    const snapshot = captureHistorySnapshot({
      collectionAddress,
      marketAddress,
      historyEvents,
    });

    expect(snapshot.assets).to.deep.equal([
      { tokenId: "1", creator, uri: "ipfs://one", owner: seller },
      { tokenId: "3", creator, uri: "ipfs://three", owner: buyer },
    ]);
    expect(snapshot.listings).to.deep.equal([
      { tokenId: "1", seller, price: "300" },
    ]);
    expect(snapshot.totalSupply).to.equal("3");
    expect(snapshot.feeRecipient).to.equal(null);
  });

  it("拒绝无法连续重放所有权的历史事件", async function () {
    const collectionAddress = "0x0000000000000000000000000000000000000001";
    const marketAddress = "0x0000000000000000000000000000000000000002";

    expect(() => captureHistorySnapshot({
      collectionAddress,
      marketAddress,
      historyEvents: [{
        type: "Transfer",
        address: collectionAddress,
        blockNumber: "1",
        logIndex: "0",
        values: {
          from: "0x0000000000000000000000000000000000000003",
          to: "0x0000000000000000000000000000000000000004",
          tokenId: "1",
        },
      }],
    })).to.throw("缺少连续的所有权转移记录");
  });
});
