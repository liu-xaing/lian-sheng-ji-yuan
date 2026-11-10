/**
 * NFT 确权与交易市场合约测试
 * 覆盖：铸造、确权、上架、购买、取消上架、价格更新
 */
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("NFTCollection", function () {
  let nftCollection;
  let owner, user1, user2;

  beforeEach(async function () {
    [owner, user1, user2] = await ethers.getSigners();
    const NFTCollection = await ethers.getContractFactory("NFTCollection");
    nftCollection = await NFTCollection.deploy("链生纪元", "LSE");
    await nftCollection.waitForDeployment();
  });

  describe("铸造功能", function () {
    it("✅ 任意账户都可以铸造 NFT", async function () {
      const tx = await nftCollection.connect(user1).mint(user1.address, "ipfs://QmTest123");
      await tx.wait();

      expect(await nftCollection.ownerOf(1)).to.equal(user1.address);
      expect(await nftCollection.tokenURI(1)).to.equal("ipfs://QmTest123");
      expect(await nftCollection.totalSupply()).to.equal(1);
    });

    it("✅ creator 记录实际铸造账户，而非接收地址", async function () {
      await nftCollection.connect(user1).mint(user2.address, "ipfs://test");

      expect(await nftCollection.ownerOf(1)).to.equal(user2.address);
      expect(await nftCollection.creatorOf(1)).to.equal(user1.address);
    });

    it("✅ 铸造给自己时 creator 记录正确", async function () {
      await nftCollection.connect(user1).mint(user1.address, "ipfs://test");
      expect(await nftCollection.creatorOf(1)).to.equal(user1.address);
    });
  });

  describe("确权功能", function () {
    beforeEach(async function () {
      await nftCollection.mint(owner.address, "ipfs://test");
    });

    it("✅ 正确查询余额", async function () {
      expect(await nftCollection.balanceOf(owner.address)).to.equal(1);
      expect(await nftCollection.balanceOf(user1.address)).to.equal(0);
    });

    it("✅ 正确查询所有者", async function () {
      expect(await nftCollection.ownerOf(1)).to.equal(owner.address);
    });

    it("✅ 转移后所有权变更", async function () {
      await nftCollection.transferFrom(owner.address, user1.address, 1);
      expect(await nftCollection.ownerOf(1)).to.equal(user1.address);
    });

    it("✅ 授权机制正常工作", async function () {
      await nftCollection.approve(user1.address, 1);
      expect(await nftCollection.getApproved(1)).to.equal(user1.address);

      await nftCollection
        .connect(user1)
        .transferFrom(owner.address, user2.address, 1);
      expect(await nftCollection.ownerOf(1)).to.equal(user2.address);
    });

    it("✅ tokensOfOwner 返回正确列表", async function () {
      await nftCollection.mint(owner.address, "ipfs://test2");
      const tokens = await nftCollection.tokensOfOwner(owner.address);
      expect(tokens.length).to.equal(2);
    });
  });
});

describe("NFTMarket", function () {
  let nftCollection, nftMarket;
  let owner, seller, buyer;
  const LISTING_PRICE = ethers.parseEther("1");
  const BUY_PRICE = ethers.parseEther("1");

  beforeEach(async function () {
    [owner, seller, buyer] = await ethers.getSigners();

    const NFTCollection = await ethers.getContractFactory("NFTCollection");
    nftCollection = await NFTCollection.deploy("链生纪元", "LSE");
    await nftCollection.waitForDeployment();

    const NFTMarket = await ethers.getContractFactory("NFTMarket");
    nftMarket = await NFTMarket.deploy();
    await nftMarket.waitForDeployment();

    // 铸造一个 NFT 给 seller
    const collectionAddr = await nftCollection.getAddress();
    await nftCollection.mint(seller.address, "ipfs://test");

    // seller 授权市场合约
    await nftCollection
      .connect(seller)
      .approve(await nftMarket.getAddress(), 1);
  });

  describe("上架功能", function () {
    it("✅ 可以成功上架 NFT", async function () {
      const collectionAddr = await nftCollection.getAddress();
      const marketAddr = await nftMarket.getAddress();

      await nftMarket
        .connect(seller)
        .listItem(collectionAddr, 1, LISTING_PRICE);

      const items = await nftMarket.getListedItems();
      expect(items.length).to.equal(1);
      expect(items[0].price).to.equal(LISTING_PRICE);
      expect(items[0].seller).to.equal(seller.address);
      expect(items[0].listed).to.equal(true);
    });

    it("❌ 非所有者不能上架", async function () {
      const collectionAddr = await nftCollection.getAddress();
      await expect(
        nftMarket
          .connect(buyer)
          .listItem(collectionAddr, 1, LISTING_PRICE)
      ).to.be.revertedWith("NFTMarket: caller is not the owner");
    });

    it("❌ 价格为 0 不能上架", async function () {
      const collectionAddr = await nftCollection.getAddress();
      await expect(
        nftMarket.connect(seller).listItem(collectionAddr, 1, 0)
      ).to.be.revertedWith("NFTMarket: price must be > 0");
    });
  });

  describe("购买功能", function () {
    beforeEach(async function () {
      const collectionAddr = await nftCollection.getAddress();
      await nftMarket
        .connect(seller)
        .listItem(collectionAddr, 1, LISTING_PRICE);
    });

    it("✅ 买家可以成功购买 NFT", async function () {
      const collectionAddr = await nftCollection.getAddress();

      await nftMarket
        .connect(buyer)
        .buyItem(collectionAddr, 1, { value: BUY_PRICE });

      // NFT 所有权转移
      expect(await nftCollection.ownerOf(1)).to.equal(buyer.address);
    });

    it("✅ 卖家收到正确金额（扣除手续费）", async function () {
      const collectionAddr = await nftCollection.getAddress();
      const sellerBefore = await ethers.provider.getBalance(seller.address);

      await nftMarket
        .connect(buyer)
        .buyItem(collectionAddr, 1, { value: BUY_PRICE });

      const sellerAfter = await ethers.provider.getBalance(seller.address);
      const fee = (LISTING_PRICE * 250n) / 10000n;
      const expectedProceeds = LISTING_PRICE - fee;

      expect(sellerAfter - sellerBefore).to.equal(expectedProceeds);
    });

    it("❌ 卖家不能购买自己的 NFT", async function () {
      const collectionAddr = await nftCollection.getAddress();
      await expect(
        nftMarket
          .connect(seller)
          .buyItem(collectionAddr, 1, { value: BUY_PRICE })
      ).to.be.revertedWith("NFTMarket: cannot buy own item");
    });

    it("❌ 支付金额不足时购买失败", async function () {
      const collectionAddr = await nftCollection.getAddress();
      await expect(
        nftMarket
          .connect(buyer)
          .buyItem(collectionAddr, 1, { value: ethers.parseEther("0.5") })
      ).to.be.revertedWith("NFTMarket: insufficient payment");
    });
  });

  describe("取消上架", function () {
    it("✅ 卖家可以取消上架", async function () {
      const collectionAddr = await nftCollection.getAddress();
      await nftMarket
        .connect(seller)
        .listItem(collectionAddr, 1, LISTING_PRICE);

      await nftMarket.connect(seller).cancelListing(collectionAddr, 1);

      const items = await nftMarket.getListedItems();
      expect(items.length).to.equal(0);
    });
  });

  describe("价格更新", function () {
    it("✅ 卖家可以更新价格", async function () {
      const collectionAddr = await nftCollection.getAddress();
      await nftMarket
        .connect(seller)
        .listItem(collectionAddr, 1, LISTING_PRICE);

      const newPrice = ethers.parseEther("2");
      await nftMarket
        .connect(seller)
        .updatePrice(collectionAddr, 1, newPrice);

      const items = await nftMarket.getListedItems();
      expect(items[0].price).to.equal(newPrice);
    });
  });
});
