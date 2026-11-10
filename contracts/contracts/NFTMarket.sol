// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title NFTMarket - NFT 交易市场合约
 * @dev 实现 NFT 上架、购买、取消上架与价格更新功能
 *      支持 ETH 支付，平台收取 2.5% 手续费
 */
contract NFTMarket {
    // ============ 结构体 ============
    struct MarketItem {
        uint256 itemId;         // 市场条目 ID
        uint256 tokenId;        // NFT Token ID
        address nftContract;    // NFT 合约地址
        address payable seller; // 卖家地址
        address payable owner;  // 当前拥有者（未上架时为买家）
        uint256 price;          // 价格（Wei）
        bool listed;            // 是否正在上架
    }

    // ============ 状态变量 ============
    address public admin;                    // 管理员
    uint256 public itemCounter;              // 市场条目计数器
    uint256 public constant PLATFORM_FEE_RATE = 250; // 2.5%（基点表示，10000 = 100%）
    address payable public feeRecipient;     // 手续费接收地址
    bool public migrationFinalized;

    // 映射：itemId -> MarketItem
    mapping(uint256 => MarketItem) public items;
    // 映射：NFT合约地址 -> tokenId -> itemId（快速查询）
    mapping(address => mapping(uint256 => uint256)) public tokenToItem;

    // ============ 事件 ============
    event ItemListed(
        uint256 indexed itemId,
        uint256 indexed tokenId,
        address indexed nftContract,
        address seller,
        uint256 price
    );

    event ItemSold(
        uint256 indexed itemId,
        uint256 indexed tokenId,
        address indexed seller,
        address buyer,
        uint256 price
    );

    event ItemCancelled(
        uint256 indexed itemId,
        uint256 indexed tokenId,
        address indexed seller
    );

    event PriceUpdated(
        uint256 indexed itemId,
        uint256 newPrice
    );

    // ============ 修饰器 ============
    modifier onlyAdmin() {
        require(msg.sender == admin, "NFTMarket: caller is not admin");
        _;
    }

    // ============ 构造函数 ============
    constructor() {
        admin = msg.sender;
        feeRecipient = payable(msg.sender);
    }

    // ============ 核心交易函数 ============

    /**
     * @dev 上架 NFT 到市场
     * @param nftContract NFT 合约地址
     * @param tokenId NFT Token ID
     * @param price 售价（Wei）
     */
    function listItem(
        address nftContract,
        uint256 tokenId,
        uint256 price
    ) external {
        require(price > 0, "NFTMarket: price must be > 0");
        require(
            IERC721(nftContract).ownerOf(tokenId) == msg.sender,
            "NFTMarket: caller is not the owner"
        );
        require(
            tokenToItem[nftContract][tokenId] == 0,
            "NFTMarket: item already listed"
        );

        // 检查市场合约是否被授权转移该 NFT
        address approved = IERC721(nftContract).getApproved(tokenId);
        bool isApprovedForAll = IERC721(nftContract).isApprovedForAll(msg.sender, address(this));
        require(
            approved == address(this) || isApprovedForAll,
            "NFTMarket: market not approved for transfer"
        );

        itemCounter++;
        uint256 itemId = itemCounter;

        items[itemId] = MarketItem({
            itemId: itemId,
            tokenId: tokenId,
            nftContract: nftContract,
            seller: payable(msg.sender),
            owner: payable(msg.sender),
            price: price,
            listed: true
        });

        tokenToItem[nftContract][tokenId] = itemId;

        emit ItemListed(itemId, tokenId, nftContract, msg.sender, price);
    }

    /**
     * @dev 仅由市场管理员恢复迁移过来的有效挂牌。
     */
    function migrateListing(
        address nftContract,
        uint256 tokenId,
        address payable seller,
        uint256 price
    ) external onlyAdmin {
        require(!migrationFinalized, "NFTMarket: migration finalized");
        require(price > 0, "NFTMarket: price must be > 0");
        require(seller != address(0), "NFTMarket: invalid seller");
        require(tokenToItem[nftContract][tokenId] == 0, "NFTMarket: item already listed");
        require(
            IERC721(nftContract).ownerOf(tokenId) == seller,
            "NFTMarket: seller is not the owner"
        );
        require(
            IERC721(nftContract).getApproved(tokenId) == address(this) ||
                IERC721(nftContract).isApprovedForAll(seller, address(this)),
            "NFTMarket: market not approved for transfer"
        );

        itemCounter++;
        uint256 itemId = itemCounter;
        items[itemId] = MarketItem({
            itemId: itemId,
            tokenId: tokenId,
            nftContract: nftContract,
            seller: seller,
            owner: seller,
            price: price,
            listed: true
        });
        tokenToItem[nftContract][tokenId] = itemId;

        emit ItemListed(itemId, tokenId, nftContract, seller, price);
    }

    function finalizeMigration() external onlyAdmin {
        migrationFinalized = true;
    }

    /**
     * @dev 购买 NFT（发送 ETH 支付）
     * @param nftContract NFT 合约地址
     * @param tokenId NFT Token ID
     */
    function buyItem(
        address nftContract,
        uint256 tokenId
    ) external payable {
        uint256 itemId = tokenToItem[nftContract][tokenId];
        require(itemId > 0, "NFTMarket: item not listed");

        MarketItem storage item = items[itemId];
        require(item.listed, "NFTMarket: item not listed");
        require(msg.value >= item.price, "NFTMarket: insufficient payment");
        require(msg.sender != item.seller, "NFTMarket: cannot buy own item");

        // 计算平台手续费
        uint256 fee = (item.price * PLATFORM_FEE_RATE) / 10000;
        uint256 sellerProceeds = item.price - fee;

        address payable seller = item.seller;
        address payable buyer = payable(msg.sender);

        // 更新状态
        item.owner = buyer;
        item.listed = false;
        delete tokenToItem[nftContract][tokenId];

        // 转移 NFT（使用 transferFrom，需要卖家预先授权）
        IERC721(nftContract).transferFrom(seller, buyer, tokenId);

        // 转账 ETH
        (bool sellerSuccess, ) = seller.call{value: sellerProceeds}("");
        require(sellerSuccess, "NFTMarket: seller payment failed");

        if (fee > 0) {
            (bool feeSuccess, ) = feeRecipient.call{value: fee}("");
            require(feeSuccess, "NFTMarket: fee payment failed");
        }

        // 退还多余 ETH
        if (msg.value > item.price) {
            (bool refundSuccess, ) = buyer.call{value: msg.value - item.price}("");
            require(refundSuccess, "NFTMarket: refund failed");
        }

        emit ItemSold(itemId, tokenId, seller, buyer, item.price);
    }

    /**
     * @dev 取消上架
     * @param nftContract NFT 合约地址
     * @param tokenId NFT Token ID
     */
    function cancelListing(
        address nftContract,
        uint256 tokenId
    ) external {
        uint256 itemId = tokenToItem[nftContract][tokenId];
        require(itemId > 0, "NFTMarket: item not listed");

        MarketItem storage item = items[itemId];
        require(item.seller == msg.sender, "NFTMarket: caller is not seller");
        require(item.listed, "NFTMarket: item not listed");

        item.listed = false;
        delete tokenToItem[nftContract][tokenId];

        emit ItemCancelled(itemId, tokenId, msg.sender);
    }

    /**
     * @dev 更新价格
     * @param nftContract NFT 合约地址
     * @param tokenId NFT Token ID
     * @param newPrice 新价格（Wei）
     */
    function updatePrice(
        address nftContract,
        uint256 tokenId,
        uint256 newPrice
    ) external {
        require(newPrice > 0, "NFTMarket: price must be > 0");
        uint256 itemId = tokenToItem[nftContract][tokenId];
        require(itemId > 0, "NFTMarket: item not listed");

        MarketItem storage item = items[itemId];
        require(item.seller == msg.sender, "NFTMarket: caller is not seller");
        require(item.listed, "NFTMarket: item not listed");

        item.price = newPrice;

        emit PriceUpdated(itemId, newPrice);
    }

    // ============ 查询函数 ============

    /**
     * @dev 获取所有正在上架的市场条目
     */
    function getListedItems() external view returns (MarketItem[] memory) {
        uint256 listedCount = 0;
        for (uint256 i = 1; i <= itemCounter; i++) {
            if (items[i].listed) listedCount++;
        }

        MarketItem[] memory listed = new MarketItem[](listedCount);
        uint256 index = 0;
        for (uint256 i = 1; i <= itemCounter; i++) {
            if (items[i].listed) {
                listed[index] = items[i];
                index++;
            }
        }
        return listed;
    }

    /**
     * @dev 获取特定卖家的所有上架条目
     */
    function getSellerItems(address seller) external view returns (MarketItem[] memory) {
        uint256 count = 0;
        for (uint256 i = 1; i <= itemCounter; i++) {
            if (items[i].seller == seller && items[i].listed) count++;
        }

        MarketItem[] memory sellerItems = new MarketItem[](count);
        uint256 index = 0;
        for (uint256 i = 1; i <= itemCounter; i++) {
            if (items[i].seller == seller && items[i].listed) {
                sellerItems[index] = items[i];
                index++;
            }
        }
        return sellerItems;
    }

    /**
     * @dev 获取特定买家的所有 NFT 条目
     */
    function getBuyerItems(address buyer) external view returns (MarketItem[] memory) {
        uint256 count = 0;
        for (uint256 i = 1; i <= itemCounter; i++) {
            if (items[i].owner == buyer) count++;
        }

        MarketItem[] memory buyerItems = new MarketItem[](count);
        uint256 index = 0;
        for (uint256 i = 1; i <= itemCounter; i++) {
            if (items[i].owner == buyer) {
                buyerItems[index] = items[i];
                index++;
            }
        }
        return buyerItems;
    }

    /**
     * @dev 设置手续费接收地址
     */
    function setFeeRecipient(address payable _feeRecipient) external onlyAdmin {
        require(_feeRecipient != address(0), "NFTMarket: zero address");
        feeRecipient = _feeRecipient;
    }
}

// ============ 接口定义 ============
interface IERC721 {
    function ownerOf(uint256 tokenId) external view returns (address);
    function transferFrom(address from, address to, uint256 tokenId) external;
    function getApproved(uint256 tokenId) external view returns (address);
    function isApprovedForAll(address owner, address operator) external view returns (bool);
}
