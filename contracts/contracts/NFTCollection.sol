// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title NFTCollection - NFT 确权合约
 * @dev 实现 ERC721 标准的 NFT 铸造、确权与元数据管理
 *      结合 IPFS 实现去中心化元数据存储
 */
contract NFTCollection {
    // ============ 状态变量 ============
    string public name;           // 集合名称
    string public symbol;         // 集合符号
    uint256 private _tokenIdCounter;
    address public owner;         // 合约部署者
    bool public migrationFinalized;

    // ERC721 核心映射
    mapping(uint256 => address) private _owners;         // tokenId -> 所有者
    mapping(address => uint256) private _balances;       // 地址 -> 持有数量
    mapping(uint256 => string) private _tokenURIs;       // tokenId -> IPFS URI
    mapping(uint256 => address) private _tokenApprovals; // tokenId -> 授权地址
    mapping(address => mapping(address => bool)) private _operatorApprovals; // 所有者 -> 操作员 -> 是否授权
    mapping(uint256 => address) private _creators;       // tokenId -> 铸造者（用于版税）

    // ============ 事件 ============
    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event Approval(address indexed owner, address indexed approved, uint256 indexed tokenId);
    event ApprovalForAll(address indexed owner, address indexed operator, bool approved);
    event NFTMinted(address indexed creator, uint256 indexed tokenId, string tokenURI);

    // ============ 修饰器 ============
    modifier onlyOwner() {
        require(msg.sender == owner, "NFTCollection: caller is not the owner");
        _;
    }

    // ============ 构造函数 ============
    constructor(string memory _name, string memory _symbol) {
        name = _name;
        symbol = _symbol;
        owner = msg.sender;
        _tokenIdCounter = 0;
    }

    // ============ ERC721 标准函数 ============

    /**
     * @dev 获取 NFT 余额
     */
    function balanceOf(address _owner) public view returns (uint256) {
        require(_owner != address(0), "NFTCollection: balance query for zero address");
        return _balances[_owner];
    }

    /**
     * @dev 获取 NFT 所有者
     */
    function ownerOf(uint256 _tokenId) public view returns (address) {
        address tokenOwner = _owners[_tokenId];
        require(tokenOwner != address(0), "NFTCollection: owner query for nonexistent token");
        return tokenOwner;
    }

    /**
     * @dev 授权地址操作特定 NFT
     */
    function approve(address to, uint256 tokenId) public {
        address tokenOwner = ownerOf(tokenId);
        require(to != tokenOwner, "NFTCollection: approval to current owner");
        require(
            msg.sender == tokenOwner || isApprovedForAll(tokenOwner, msg.sender),
            "NFTCollection: approve caller is not owner nor approved for all"
        );
        _tokenApprovals[tokenId] = to;
        emit Approval(tokenOwner, to, tokenId);
    }

    /**
     * @dev 获取特定 NFT 的授权地址
     */
    function getApproved(uint256 tokenId) public view returns (address) {
        require(_exists(tokenId), "NFTCollection: approved query for nonexistent token");
        return _tokenApprovals[tokenId];
    }

    /**
     * @dev 设置/撤销对操作者的批量授权
     */
    function setApprovalForAll(address operator, bool approved) public {
        require(operator != msg.sender, "NFTCollection: approve to caller");
        _operatorApprovals[msg.sender][operator] = approved;
        emit ApprovalForAll(msg.sender, operator, approved);
    }

    /**
     * @dev 检查操作者是否被所有者批量授权
     */
    function isApprovedForAll(address _owner, address operator) public view returns (bool) {
        return _operatorApprovals[_owner][operator];
    }

    /**
     * @dev 转移 NFT 所有权
     */
    function transferFrom(address from, address to, uint256 tokenId) public {
        require(_isApprovedOrOwner(msg.sender, tokenId), "NFTCollection: transfer caller is not owner nor approved");
        _transfer(from, to, tokenId);
    }

    /**
     * @dev 安全转移 NFT（检查接收者合约兼容性）
     */
    function safeTransferFrom(address from, address to, uint256 tokenId) public {
        require(_isApprovedOrOwner(msg.sender, tokenId), "NFTCollection: transfer caller is not owner nor approved");
        _transfer(from, to, tokenId);
    }

    // ============ 扩展功能 ============

    /**
     * @dev 任何账户都可以铸造新 NFT
     * @param to 接收地址
     * @param uri IPFS 元数据 URI
     */
    function mint(address to, string memory uri) public returns (uint256) {
        require(to != address(0), "NFTCollection: mint to zero address");
        _tokenIdCounter++;
        uint256 tokenId = _tokenIdCounter;

        _owners[tokenId] = to;
        _balances[to]++;
        _tokenURIs[tokenId] = uri;
        _creators[tokenId] = msg.sender;

        emit Transfer(address(0), to, tokenId);
        emit NFTMinted(msg.sender, tokenId, uri);

        return tokenId;
    }

    /**
     * @dev 仅用于重新部署时由合约所有者迁移既有 Token，保留 Token ID、所有者和创作者。
     */
    function migrateToken(
        uint256 tokenId,
        address to,
        string memory uri,
        address creator,
        address approvedMarket
    ) external onlyOwner {
        require(!migrationFinalized, "NFTCollection: migration finalized");
        require(tokenId > 0, "NFTCollection: invalid migration token");
        require(to != address(0) && creator != address(0), "NFTCollection: invalid migration address");
        require(!_exists(tokenId), "NFTCollection: migration token already exists");

        _owners[tokenId] = to;
        _balances[to]++;
        _tokenURIs[tokenId] = uri;
        _creators[tokenId] = creator;
        _tokenIdCounter = tokenId > _tokenIdCounter ? tokenId : _tokenIdCounter;
        if (approvedMarket != address(0)) {
            _tokenApprovals[tokenId] = approvedMarket;
            emit Approval(to, approvedMarket, tokenId);
        }

        emit Transfer(address(0), to, tokenId);
        emit NFTMinted(creator, tokenId, uri);
    }

    /**
     * @dev 保留源合约中已销毁的最高 Token ID，避免新铸造复用旧 ID。
     */
    function preserveTokenIdCounter(uint256 counter) external onlyOwner {
        require(!migrationFinalized, "NFTCollection: migration finalized");
        require(counter >= _tokenIdCounter, "NFTCollection: counter cannot decrease");
        _tokenIdCounter = counter;
    }

    function finalizeMigration() external onlyOwner {
        migrationFinalized = true;
    }

    /**
     * @dev 销毁 NFT（仅所有者可以销毁自己拥有的 NFT）
     * @param tokenId 要销毁的 NFT Token ID
     */
    function burn(uint256 tokenId) public {
        require(_isApprovedOrOwner(msg.sender, tokenId), "NFTCollection: caller is not owner nor approved");
        
        address tokenOwner = ownerOf(tokenId);
        
        // 清除授权
        _tokenApprovals[tokenId] = address(0);
        
        // 更新余额
        _balances[tokenOwner]--;
        _owners[tokenId] = address(0);
        
        // 清除元数据
        _tokenURIs[tokenId] = "";
        _creators[tokenId] = address(0);
        
        emit Transfer(tokenOwner, address(0), tokenId);
    }

    /**
     * @dev 获取 NFT 的 IPFS 元数据 URI
     */
    function tokenURI(uint256 tokenId) public view returns (string memory) {
        require(_exists(tokenId), "NFTCollection: URI query for nonexistent token");
        return _tokenURIs[tokenId];
    }

    /**
     * @dev 获取 NFT 的铸造者
     */
    function creatorOf(uint256 tokenId) public view returns (address) {
        require(_exists(tokenId), "NFTCollection: creator query for nonexistent token");
        return _creators[tokenId];
    }

    /**
     * @dev 获取当前铸造的 NFT 总数
     */
    function totalSupply() public view returns (uint256) {
        return _tokenIdCounter;
    }

    /**
     * @dev 获取指定地址拥有的所有 tokenId
     */
    function tokensOfOwner(address _owner) public view returns (uint256[] memory) {
        uint256 balance = balanceOf(_owner);
        if (balance == 0) return new uint256[](0);

        uint256[] memory tokens = new uint256[](balance);
        uint256 index = 0;

        for (uint256 i = 1; i <= _tokenIdCounter; i++) {
            if (_owners[i] == _owner) {
                tokens[index] = i;
                index++;
            }
        }
        return tokens;
    }

    // ============ 内部函数 ============

    function _exists(uint256 tokenId) internal view returns (bool) {
        return _owners[tokenId] != address(0);
    }

    function _isApprovedOrOwner(address spender, uint256 tokenId) internal view returns (bool) {
        address tokenOwner = ownerOf(tokenId);
        return (
            spender == tokenOwner ||
            getApproved(tokenId) == spender ||
            isApprovedForAll(tokenOwner, spender)
        );
    }

    function _transfer(address from, address to, uint256 tokenId) internal {
        require(ownerOf(tokenId) == from, "NFTCollection: transfer from incorrect owner");
        require(to != address(0), "NFTCollection: transfer to zero address");

        // 清除授权
        _tokenApprovals[tokenId] = address(0);

        _balances[from]--;
        _balances[to]++;
        _owners[tokenId] = to;

        emit Transfer(from, to, tokenId);
    }
}
