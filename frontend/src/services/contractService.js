/**
 * 合约交互服务
 * 封装所有与智能合约的交互操作：铸造、上架、购买、取消上架
 */
import axios from "axios";
import Web3 from "web3";
import { NFT_COLLECTION_ADDRESS, NFT_MARKET_ADDRESS, API_BASE_URL } from "../config/contracts";

const IPFS_GATEWAYS = [
  "https://gateway.pinata.cloud/ipfs/",
  "https://dweb.link/ipfs/",
  "https://ipfs.io/ipfs/",
];

export function normalizeIpfsUri(value) {
  const uri = typeof value === "string" ? value.trim() : "";
  if (!uri || /^(https?:\/\/|ipfs:\/\/)/i.test(uri)) {
    return uri.replace(/^ipfs:\/\/ipfs\//i, "ipfs://");
  }
  return `ipfs://${uri.replace(/^\/+/, "")}`;
}

export function getIpfsGatewayUrl(uri) {
  const normalizedUri = normalizeIpfsUri(uri);
  if (normalizedUri.startsWith("ipfs://")) {
    return `${IPFS_GATEWAYS[0]}${normalizedUri.slice("ipfs://".length)}`;
  }
  return normalizedUri;
}

export function getIpfsGatewayUrls(uri) {
  const normalizedUri = normalizeIpfsUri(uri);
  const ipfsUri = normalizedUri.match(/^ipfs:\/\/(.+)$/i);

  if (ipfsUri) {
    const path = ipfsUri[1].replace(/^ipfs\//i, "");
    const cid = path.split("/")[0];
    const proxyUrl = path === cid
      ? `${API_BASE_URL}/api/ipfs/image/${encodeURIComponent(cid)}`
      : null;
    return [
      proxyUrl,
      ...IPFS_GATEWAYS.map((gateway) => `${gateway}${path}`),
    ].filter(Boolean);
  }

  const gatewayUri = normalizedUri.match(/^https?:\/\/[^/]+\/ipfs\/([^?#]+)(?:[?#].*)?$/i);
  if (gatewayUri) {
    const path = gatewayUri[1];
    const cid = path.split("/")[0];
    const proxyUrl = path === cid
      ? `${API_BASE_URL}/api/ipfs/image/${encodeURIComponent(cid)}`
      : null;
    return [
      normalizedUri,
      proxyUrl,
      ...IPFS_GATEWAYS.map((gateway) => `${gateway}${path}`),
    ].filter((url, index, urls) => url && urls.indexOf(url) === index);
  }

  return normalizedUri ? [normalizedUri] : [];
}

export async function uploadImage(file) {
  const formData = new FormData();
  formData.append("image", file);
  const response = await axios.post(`${API_BASE_URL}/api/ipfs/upload-image`, formData);
  return response.data.uri;
}

export async function getFavoriteState(tokenId, address) {
  const response = await axios.get(`${API_BASE_URL}/api/nft/${tokenId}/favorite-count`, {
    params: address ? { address } : {},
  });
  return response.data;
}

export async function toggleFavorite(tokenId, address) {
  const response = await axios.post(`${API_BASE_URL}/api/nft/${tokenId}/favorite`, { address });
  return response.data;
}

export async function getAccountHistory(address) {
  const response = await axios.get(`${API_BASE_URL}/api/history/account`, { params: { address } });
  return response.data.history;
}

export async function getTokenHistory(tokenId) {
  const response = await axios.get(`${API_BASE_URL}/api/history/token/${tokenId}`);
  return response.data.history;
}

/**
 * 铸造 NFT
 * @param {Object} contract - NFTCollection 合约实例
 * @param {string} account - 当前账户地址
 * @param {Object} metadata - NFT 元数据 { name, description, image, attributes }
 * @returns {Object} 铸造结果
 */
export async function mintNFT(contract, account, metadata) {
  try {
    // 1. 上传元数据到 IPFS（通过后端 API）
    const uploadRes = await axios.post(`${API_BASE_URL}/api/ipfs/upload`, metadata);
    const ipfsUri = uploadRes.data.uri;

    console.log("📤 元数据已上传到 IPFS:", ipfsUri);

    // 2. 调用合约铸造 NFT
    const tx = await contract.methods.mint(account, ipfsUri).send({ from: account });
    const tokenId = tx.events?.Transfer?.returnValues?.tokenId || tx.events?.NFTMinted?.returnValues?.tokenId;

    console.log("✅ NFT 铸造成功, Token ID:", tokenId);

    return {
      success: true,
      tokenId,
      ipfsUri,
      txHash: tx.transactionHash,
      metadata: uploadRes.data.metadata,
    };
  } catch (error) {
    console.error("❌ 铸造失败:", error);
    return { success: false, error: error.message };
  }
}

/**
 * 销毁（删除）NFT
 * @param {Object} contract - NFTCollection 合约实例
 * @param {string} account - 当前账户地址
 * @param {string} tokenId - 要销毁的 NFT Token ID
 * @returns {Object} 销毁结果
 */
export async function burnNFT(contract, account, tokenId) {
  try {
    console.log("🔥 正在销毁 NFT, Token ID:", tokenId);
    console.log("📋 合约对象:", contract);
    console.log("📋 合约方法:", contract.methods);
    console.log("📋 burn 方法是否存在:", typeof contract.methods.burn);
    
    if (!contract.methods.burn) {
      console.error("❌ 合约中没有 burn 方法！");
      console.log("可用的方法:", Object.keys(contract.methods));
      return { 
        success: false, 
        error: "合约中没有 burn 方法，请检查 ABI 配置和合约版本" 
      };
    }
    
    const tx = await contract.methods.burn(tokenId).send({ from: account });
    
    console.log("✅ NFT 已销毁, Token ID:", tokenId);

    return {
      success: true,
      txHash: tx.transactionHash,
      tokenId,
    };
  } catch (error) {
    console.error("❌ 销毁失败:", error);
    return { success: false, error: error.message };
  }
}

/**
 * 上架 NFT 到市场
 * @param {Object} nftContract - NFTCollection 合约实例
 * @param {Object} marketContract - NFTMarket 合约实例
 * @param {string} account - 当前账户地址
 * @param {string} tokenId - NFT Token ID
 * @param {string} priceEth - 价格（ETH）
 * @returns {Object} 上架结果
 */
export async function listItem(nftContract, marketContract, account, tokenId, priceEth) {
  try {
    const collectionAddress = nftContract.options.address;
    const marketAddress = marketContract.options.address;
    const priceWei = Web3.utils.toWei(priceEth, "ether");
    if (BigInt(priceWei) <= 0n) {
      throw new Error("请输入大于 0 的上架价格");
    }

    const owner = await nftContract.methods.ownerOf(tokenId).call();
    if (owner.toLowerCase() !== account.toLowerCase()) {
      throw new Error("当前连接的钱包不是该 NFT 的所有者，请切换到持有该 NFT 的账户");
    }

    const existingItemId = await marketContract.methods
      .tokenToItem(collectionAddress, tokenId)
      .call();
    if (BigInt(existingItemId) !== 0n) {
      throw new Error(`该 NFT 已在市场上架（条目 #${existingItemId}），请先取消上架再重新上架`);
    }

    // 1. 授权市场合约操作该 NFT
    const approved = await nftContract.methods.getApproved(tokenId).call();
    const isApprovedForAll = await nftContract.methods
      .isApprovedForAll(account, marketAddress)
      .call();
    if (approved.toLowerCase() !== marketAddress.toLowerCase() && !isApprovedForAll) {
      console.log("🔐 正在授权市场合约...");
      await nftContract.methods
        .approve(marketAddress, tokenId)
        .send({ from: account });
    }

    // 2. 先模拟交易，尽早显示合约的具体拒绝原因
    await marketContract.methods
      .listItem(collectionAddress, tokenId, priceWei)
      .call({ from: account });

    // 3. 上架到市场
    const tx = await marketContract.methods
      .listItem(collectionAddress, tokenId, priceWei)
      .send({ from: account });

    console.log("✅ NFT 已上架市场, Token ID:", tokenId, "价格:", priceEth, "ETH");

    return {
      success: true,
      txHash: tx.transactionHash,
      price: priceEth,
    };
  } catch (error) {
    console.error("❌ 上架失败:", error);
    return { success: false, error: error.cause?.message || error.message };
  }
}

/**
 * 购买 NFT
 * @param {Object} marketContract - NFTMarket 合约实例
 * @param {string} account - 当前账户地址
 * @param {string} tokenId - NFT Token ID
 * @param {string} priceWei - 价格（Wei）
 * @returns {Object} 购买结果
 */
export async function buyNFT(marketContract, nftContract, account, tokenId, expectedPriceWei) {
  try {
    const collectionAddress = nftContract.options.address;
    const itemId = await marketContract.methods
      .tokenToItem(collectionAddress, tokenId)
      .call();
    if (BigInt(itemId) === 0n) {
      throw new Error("该 NFT 已下架或已被购买，请刷新市场");
    }

    const item = await marketContract.methods.items(itemId).call();
    if (!item.listed) {
      throw new Error("该 NFT 已下架或已被购买，请刷新市场");
    }
    if (item.seller.toLowerCase() === account.toLowerCase()) {
      throw new Error("不能购买自己上架的 NFT");
    }

    const priceWei = item.price.toString();
    if (expectedPriceWei && priceWei !== expectedPriceWei.toString()) {
      throw new Error("挂牌价格已变更，请刷新市场并重新确认购买");
    }

    await marketContract.methods
      .buyItem(collectionAddress, tokenId)
      .call({ from: account, value: priceWei });

    const tx = await marketContract.methods
      .buyItem(collectionAddress, tokenId)
      .send({ from: account, value: priceWei });

    console.log("✅ NFT 购买成功, Token ID:", tokenId);

    return {
      success: true,
      txHash: tx.transactionHash,
      price: priceWei,
    };
  } catch (error) {
    console.error("❌ 购买失败:", error);
    return { success: false, error: error.cause?.message || error.message };
  }
}

/**
 * 取消上架
 * @param {Object} marketContract - NFTMarket 合约实例
 * @param {string} account - 当前账户地址
 * @param {string} tokenId - NFT Token ID
 * @returns {Object} 取消结果
 */
export async function cancelListing(marketContract, account, tokenId, collectionAddress = NFT_COLLECTION_ADDRESS) {
  try {
    const tx = await marketContract.methods
      .cancelListing(collectionAddress, tokenId)
      .send({ from: account });

    console.log("✅ 已取消上架, Token ID:", tokenId);

    return {
      success: true,
      txHash: tx.transactionHash,
    };
  } catch (error) {
    console.error("❌ 取消失败:", error);
    return { success: false, error: error.message };
  }
}

export async function updateListingPrice(marketContract, nftContract, account, tokenId, priceEth) {
  try {
    const priceWei = Web3.utils.toWei(priceEth, "ether");
    if (BigInt(priceWei) <= 0n) throw new Error("价格必须大于 0");

    const collectionAddress = nftContract.options.address;
    const itemId = await marketContract.methods.tokenToItem(collectionAddress, tokenId).call();
    if (BigInt(itemId) === 0n) throw new Error("该 NFT 当前未上架");
    const item = await marketContract.methods.items(itemId).call();
    if (!item.listed) throw new Error("该 NFT 当前未上架");
    if (item.seller.toLowerCase() !== account.toLowerCase()) {
      throw new Error("只有卖家本人可以修改挂牌价格");
    }

    await marketContract.methods
      .updatePrice(collectionAddress, tokenId, priceWei)
      .call({ from: account });
    const tx = await marketContract.methods
      .updatePrice(collectionAddress, tokenId, priceWei)
      .send({ from: account });
    return { success: true, txHash: tx.transactionHash, price: priceWei };
  } catch (error) {
    console.error("❌ 更新挂牌价格失败:", error);
    return { success: false, error: error.cause?.message || error.message };
  }
}

/**
 * 获取市场上架的所有 NFT
 * @param {Object} marketContract - NFTMarket 合约实例
 * @returns {Array} 上架列表
 */
export async function getListedItems(marketContract) {
  try {
    const items = await marketContract.methods.getListedItems().call();
    return items.map((item) => ({
      itemId: item.itemId.toString(),
      tokenId: item.tokenId.toString(),
      nftContract: item.nftContract,
      seller: item.seller,
      owner: item.owner,
      price: item.price.toString(),
      listed: item.listed,
    }));
  } catch (error) {
    console.error("❌ 获取市场列表失败:", error);
    throw error;
  }
}

/**
 * 获取用户的 NFT
 * @param {Object} nftContract - NFTCollection 合约实例
 * @param {string} account - 用户地址
 * @returns {Array} 用户的 tokenId 列表
 */
export async function getUserTokens(nftContract, account) {
  try {
    const tokens = await nftContract.methods.tokensOfOwner(account).call();
    return tokens.map((t) => t.toString());
  } catch (error) {
    console.error("❌ 获取用户 NFT 失败:", error);
    throw error;
  }
}

/**
 * 获取 NFT 元数据
 * @param {Object} nftContract - NFTCollection 合约实例
 * @param {string} tokenId - Token ID
 * @returns {Object} 元数据
 */
export async function getTokenMetadata(nftContract, tokenId) {
  try {
    const uri = await nftContract.methods.tokenURI(tokenId).call();
    const owner = await nftContract.methods.ownerOf(tokenId).call();
    const creator = await nftContract.methods.creatorOf(tokenId).call();

    console.log("📋 NFT 元数据查询:", { tokenId, uri, owner, creator });

    // 尝试从 IPFS 获取元数据
    let metadata = null;
    if (/^ipfs:\/\//i.test(uri) || /^https?:\/\/.+\/ipfs\//i.test(uri)) {
      const ipfsUri = normalizeIpfsUri(uri);
      const ipfsPath = ipfsUri.match(/^ipfs:\/\/(.+)$/i)?.[1];
      const hash = ipfsPath?.replace(/^ipfs\//i, "");

      if (hash) {
        console.log("🔍 尝试从后端获取元数据, Hash:", hash);
        try {
          const res = await axios.get(`${API_BASE_URL}/api/ipfs/${encodeURIComponent(hash)}`, { timeout: 5000 });
          metadata = res.data;
          console.log("✅ 从后端获取元数据成功:", metadata);
        } catch (backendError) {
          console.warn("⚠️ 后端获取失败，尝试 IPFS 网关:", backendError.message);
        }
      }

      if (!metadata) {
        const gatewayUrls = getIpfsGatewayUrls(uri);
        let lastError;
        for (const gatewayUrl of gatewayUrls) {
          try {
            console.log("🔍 尝试从 IPFS 网关获取:", gatewayUrl);
            const res = await axios.get(gatewayUrl, { timeout: 10000 });
            metadata = res.data;
            console.log("✅ 从 IPFS 网关获取成功:", metadata);
            break;
          } catch (error) {
            lastError = error;
            console.warn(`⚠️ IPFS 网关读取失败 (${gatewayUrl}):`, error.message);
          }
        }

        if (!metadata) {
          console.error("❌ 无法读取 NFT 元数据:", {
            uri,
            gatewayError: lastError?.message || "没有可用的 IPFS 网关",
          });
          metadata = {
            name: `NFT #${tokenId}`,
            description: "元数据无法读取，请检查 Pinata CID 和网关配置",
            image: "",
          };
        }
      }
    } else if (/^https?:\/\//i.test(uri)) {
      console.log("📎 使用普通图片 URL:", uri);
      metadata = {
        name: `NFT #${tokenId}`,
        description: "",
        image: uri,
      };
    }

    const result = {
      tokenId,
      uri,
      owner,
      creator,
      metadata: metadata || { name: `NFT #${tokenId}`, description: "", image: "" },
    };
    
    console.log("📋 返回的元数据:", result);
    return result;
  } catch (error) {
    console.error("❌ 获取 NFT 元数据失败:", error);
    return null;
  }
}
