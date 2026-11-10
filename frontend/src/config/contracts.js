/**
 * 合约配置
 * 部署后请更新以下地址
 */

// NFTCollection 合约地址（部署后替换）
export const NFT_COLLECTION_ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3";

// NFTMarket 合约地址（部署后替换）
export const NFT_MARKET_ADDRESS = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";

// NFTCollection ABI（精简版，包含前端需要的函数）
export const NFT_COLLECTION_ABI = [
  {
    inputs: [{ name: "_name", type: "string" }, { name: "_symbol", type: "string" }],
    stateMutability: "nonpayable",
    type: "constructor",
  },
  {
    inputs: [{ name: "_owner", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "_tokenId", type: "uint256" }],
    name: "ownerOf",
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "to", type: "address" }, { name: "tokenId", type: "uint256" }],
    name: "approve",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ name: "tokenId", type: "uint256" }],
    name: "getApproved",
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "operator", type: "address" }, { name: "approved", type: "bool" }],
    name: "setApprovalForAll",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ name: "_owner", type: "address" }, { name: "operator", type: "address" }],
    name: "isApprovedForAll",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "from", type: "address" }, { name: "to", type: "address" }, { name: "tokenId", type: "uint256" }],
    name: "transferFrom",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ name: "to", type: "address" }, { name: "uri", type: "string" }],
    name: "mint",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ name: "tokenId", type: "uint256" }],
    name: "burn",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ name: "tokenId", type: "uint256" }],
    name: "tokenURI",
    outputs: [{ name: "", type: "string" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "tokenId", type: "uint256" }],
    name: "creatorOf",
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "totalSupply",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "_owner", type: "address" }],
    name: "tokensOfOwner",
    outputs: [{ name: "", type: "uint256[]" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "name",
    outputs: [{ name: "", type: "string" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "symbol",
    outputs: [{ name: "", type: "string" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "owner",
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: "from", type: "address" },
      { indexed: true, name: "to", type: "address" },
      { indexed: true, name: "tokenId", type: "uint256" },
    ],
    name: "Transfer",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: "creator", type: "address" },
      { indexed: true, name: "tokenId", type: "uint256" },
      { indexed: false, name: "tokenURI", type: "string" },
    ],
    name: "NFTMinted",
    type: "event",
  },
];

// NFTMarket ABI（精简版）
export const NFT_MARKET_ABI = [
  {
    inputs: [],
    stateMutability: "nonpayable",
    type: "constructor",
  },
  {
    inputs: [
      { name: "nftContract", type: "address" },
      { name: "tokenId", type: "uint256" },
      { name: "price", type: "uint256" },
    ],
    name: "listItem",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { name: "nftContract", type: "address" },
      { name: "tokenId", type: "uint256" },
    ],
    name: "tokenToItem",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "itemId", type: "uint256" }],
    name: "items",
    outputs: [
      { name: "itemId", type: "uint256" },
      { name: "tokenId", type: "uint256" },
      { name: "nftContract", type: "address" },
      { name: "seller", type: "address" },
      { name: "owner", type: "address" },
      { name: "price", type: "uint256" },
      { name: "listed", type: "bool" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { name: "nftContract", type: "address" },
      { name: "tokenId", type: "uint256" },
    ],
    name: "buyItem",
    outputs: [],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [
      { name: "nftContract", type: "address" },
      { name: "tokenId", type: "uint256" },
    ],
    name: "cancelListing",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { name: "nftContract", type: "address" },
      { name: "tokenId", type: "uint256" },
      { name: "newPrice", type: "uint256" },
    ],
    name: "updatePrice",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "getListedItems",
    outputs: [
      {
        components: [
          { name: "itemId", type: "uint256" },
          { name: "tokenId", type: "uint256" },
          { name: "nftContract", type: "address" },
          { name: "seller", type: "address" },
          { name: "owner", type: "address" },
          { name: "price", type: "uint256" },
          { name: "listed", type: "bool" },
        ],
        name: "",
        type: "tuple[]",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "seller", type: "address" }],
    name: "getSellerItems",
    outputs: [
      {
        components: [
          { name: "itemId", type: "uint256" },
          { name: "tokenId", type: "uint256" },
          { name: "nftContract", type: "address" },
          { name: "seller", type: "address" },
          { name: "owner", type: "address" },
          { name: "price", type: "uint256" },
          { name: "listed", type: "bool" },
        ],
        name: "",
        type: "tuple[]",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "buyer", type: "address" }],
    name: "getBuyerItems",
    outputs: [
      {
        components: [
          { name: "itemId", type: "uint256" },
          { name: "tokenId", type: "uint256" },
          { name: "nftContract", type: "address" },
          { name: "seller", type: "address" },
          { name: "owner", type: "address" },
          { name: "price", type: "uint256" },
          { name: "listed", type: "bool" },
        ],
        name: "",
        type: "tuple[]",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: "itemId", type: "uint256" },
      { indexed: true, name: "tokenId", type: "uint256" },
      { indexed: true, name: "nftContract", type: "address" },
      { indexed: false, name: "seller", type: "address" },
      { indexed: false, name: "price", type: "uint256" },
    ],
    name: "ItemListed",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: "itemId", type: "uint256" },
      { indexed: true, name: "tokenId", type: "uint256" },
      { indexed: false, name: "seller", type: "address" },
      { indexed: false, name: "buyer", type: "address" },
      { indexed: false, name: "price", type: "uint256" },
    ],
    name: "ItemSold",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: "itemId", type: "uint256" },
      { indexed: true, name: "tokenId", type: "uint256" },
      { indexed: false, name: "seller", type: "address" },
    ],
    name: "ItemCancelled",
    type: "event",
  },
];

// 后端 API 地址
export const API_BASE_URL = "http://localhost:3001";
