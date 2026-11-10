/**
 * MyAssets 组件
 * 展示当前用户拥有的所有 NFT，支持上架和删除操作
 */
import React, { useState, useEffect, useCallback, useMemo } from "react";
import NFTCard from "./NFTCard";
import { getUserTokens, getListedItems, burnNFT, listItem } from "../services/contractService";
import "./MyAssets.css";

export default function MyAssets({ nftContract, marketContract, account, weiToEth, shortenAddress, refreshKey }) {
  const [tokens, setTokens] = useState([]);
  const [listedItems, setListedItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [assetFilter, setAssetFilter] = useState("all");
  const [sortOrder, setSortOrder] = useState("newest");
  const [listingTokenId, setListingTokenId] = useState(null);
  const [listPrice, setListPrice] = useState("");
  const [burningTokenId, setBurningTokenId] = useState(null);

  const fetchAssets = useCallback(async () => {
    if (!nftContract || !account) return;
    setLoading(true);
    setLoadError("");

    try {
      // 获取用户拥有的 tokenId
      const userTokens = await getUserTokens(nftContract, account);
      setTokens(userTokens);

      // 获取市场上架列表（用于判断哪些已上架）
      if (marketContract) {
        const items = await getListedItems(marketContract);
        setListedItems(items);
      }
    } catch (error) {
      console.error("获取资产失败:", error);
      setLoadError(error.message || "读取资产失败，请检查钱包网络后重试");
    } finally {
      setLoading(false);
    }
  }, [nftContract, marketContract, account]);

  useEffect(() => {
    fetchAssets();
  }, [fetchAssets, refreshKey]);

  const handleList = async (tokenId) => {
    if (!listPrice || parseFloat(listPrice) <= 0) {
      alert("请输入有效的价格");
      return;
    }

    const result = await listItem(nftContract, marketContract, account, tokenId, listPrice);
    if (result.success) {
      alert(`✅ NFT #${tokenId} 已上架，价格: ${listPrice} ETH`);
      setListingTokenId(null);
      setListPrice("");
      fetchAssets();
    } else {
      alert(`❌ 上架失败: ${result.error}`);
    }
  };

  const handleBurn = async (tokenId) => {
    if (!window.confirm(`⚠️ 确定要删除（销毁）NFT #${tokenId} 吗？此操作不可恢复！`)) {
      return;
    }

    setBurningTokenId(tokenId);
    const result = await burnNFT(nftContract, account, tokenId);
    
    if (result.success) {
      alert(`🔥 NFT #${tokenId} 已成功销毁！`);
      setBurningTokenId(null);
      fetchAssets();
    } else {
      alert(`❌ 销毁失败: ${result.error}`);
      setBurningTokenId(null);
    }
  };

  const isTokenListed = (tokenId) => {
    return listedItems.some((item) => item.tokenId === tokenId && item.listed);
  };

  const getTokenListing = (tokenId) => {
    return listedItems.find((item) => item.tokenId === tokenId && item.listed);
  };

  const visibleTokens = useMemo(() => {
    const filtered = tokens.filter((tokenId) => {
      const matchesSearch = tokenId.includes(searchQuery.trim());
      const listed = listedItems.some((item) => item.tokenId === tokenId && item.listed);
      return matchesSearch &&
        (assetFilter === "all" || (assetFilter === "listed" ? listed : !listed));
    });

    return filtered.sort((a, b) => {
      if (sortOrder === "oldest") return BigInt(a) < BigInt(b) ? -1 : 1;
      if (sortOrder === "price-low" || sortOrder === "price-high") {
        const priceA = BigInt(getTokenListing(a)?.price || "0");
        const priceB = BigInt(getTokenListing(b)?.price || "0");
        if (priceA === priceB) return BigInt(a) < BigInt(b) ? -1 : 1;
        return sortOrder === "price-low"
          ? (priceA < priceB ? -1 : 1)
          : (priceA > priceB ? -1 : 1);
      }
      return BigInt(a) > BigInt(b) ? -1 : 1;
    });
  }, [tokens, listedItems, searchQuery, assetFilter, sortOrder]);

  return (
    <section id="assets" className="assets-section">
      <div className="section-header">
        <h2 className="section-title">我的资产</h2>
        <p className="section-desc">
          你拥有 <strong>{tokens.length}</strong> 个 NFT
        </p>
        <button className="btn-refresh" onClick={fetchAssets} disabled={loading}>
          {loading ? "加载中…" : "刷新"}
        </button>
      </div>

      {!account ? (
        <div className="assets-empty">
          <span className="empty-icon" aria-hidden="true">W</span>
          <p>请先连接钱包查看你的资产</p>
        </div>
      ) : loading ? (
        <div className="assets-loading">
          <div className="loading-spinner"></div>
          <p>正在加载资产数据...</p>
        </div>
      ) : loadError ? (
        <div className="assets-empty assets-error" role="alert">
          <span className="empty-icon" aria-hidden="true">!</span>
          <p>资产加载失败：{loadError}</p>
          <button className="btn-refresh" onClick={fetchAssets}>重试</button>
        </div>
      ) : tokens.length === 0 ? (
        <div className="assets-empty">
          <span className="empty-icon" aria-hidden="true">—</span>
          <p>你还没有任何 NFT</p>
          <p className="empty-hint">去铸造页面创建你的第一个 NFT 吧！</p>
        </div>
      ) : (
        <>
        <div className="asset-toolbar">
          <label className="asset-search">
            <span>搜索 Token ID</span>
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="输入编号"
            />
          </label>
          <label>
            <span>状态</span>
            <select value={assetFilter} onChange={(event) => setAssetFilter(event.target.value)}>
              <option value="all">全部资产</option>
              <option value="unlisted">未上架</option>
              <option value="listed">已上架</option>
            </select>
          </label>
          <label>
            <span>排序</span>
            <select value={sortOrder} onChange={(event) => setSortOrder(event.target.value)}>
              <option value="newest">编号从新到旧</option>
              <option value="oldest">编号从旧到新</option>
              <option value="price-low">挂牌价从低到高</option>
              <option value="price-high">挂牌价从高到低</option>
            </select>
          </label>
          <span className="asset-result-count">显示 {visibleTokens.length} / {tokens.length}</span>
        </div>
        {visibleTokens.length === 0 ? (
          <div className="assets-empty">
            <span className="empty-icon" aria-hidden="true">—</span>
            <p>没有符合条件的 NFT</p>
          </div>
        ) : (
        <div className="assets-grid">
          {visibleTokens.map((tokenId) => {
            const listing = getTokenListing(tokenId);
            return (
              <div key={tokenId} className="asset-wrapper">
              <NFTCard
                tokenId={tokenId}
                price={null}
                seller={null}
                owner={account}
                listed={isTokenListed(tokenId)}
                nftContract={nftContract}
                marketContract={marketContract}
                account={account}
                weiToEth={weiToEth}
                shortenAddress={shortenAddress}
                showActions={false}
              />

              {!listing && (
                <div className="list-panel">
                  {listingTokenId === tokenId ? (
                    <div className="list-form">
                      <input
                        type="number"
                        step="0.001"
                        min="0.001"
                        value={listPrice}
                        onChange={(e) => setListPrice(e.target.value)}
                        placeholder="输入价格 (ETH)"
                        className="list-price-input"
                      />
                      <div className="list-form-actions">
                        <button className="btn-confirm-list" onClick={() => handleList(tokenId)}>
                          确认上架
                        </button>
                        <button className="btn-cancel-list" onClick={() => setListingTokenId(null)}>
                          取消
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="asset-actions">
                      <button
                        className="btn-list"
                        onClick={() => setListingTokenId(tokenId)}
                      >
                        📤 上架出售
                      </button>
                      <button
                        className="btn-burn"
                        onClick={() => handleBurn(tokenId)}
                        disabled={burningTokenId === tokenId}
                      >
                        {burningTokenId === tokenId ? "⏳ 销毁中..." : "🗑️ 删除"}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {listing && (
                <div className="listed-badge-wrapper">
                  <span className="listed-badge">
                    🏷️ 已上架市场 · {weiToEth(listing.price)} ETH
                  </span>
                </div>
              )}
              </div>
            );
          })}
        </div>
        )}
        </>
      )}
    </section>
  );
}
