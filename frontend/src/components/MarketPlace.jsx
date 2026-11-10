/**
 * MarketPlace 组件
 * 展示市场上架的所有 NFT，支持购买和取消上架
 */
import React, { useState, useEffect, useCallback } from "react";
import NFTCard from "./NFTCard";
import { getListedItems, buyNFT, cancelListing } from "../services/contractService";
import "./MarketPlace.css";

export default function MarketPlace({ nftContract, marketContract, account, weiToEth, shortenAddress, refreshKey, onPurchased }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  const fetchItems = useCallback(async () => {
    if (!marketContract) return;
    setLoading(true);
    setLoadError("");
    try {
      const listedItems = await getListedItems(marketContract);
      setItems(listedItems);
    } catch (error) {
      console.error("获取市场列表失败:", error);
      setLoadError(error.message || "读取市场失败，请检查钱包网络后重试");
    } finally {
      setLoading(false);
    }
  }, [marketContract]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems, refreshKey]);

  const handleBuy = async (tokenId, price) => {
    if (!account) {
      alert("请先连接钱包");
      return;
    }
    if (!window.confirm(`确认以 ${weiToEth(price)} ETH 购买 NFT #${tokenId}？`)) {
      return;
    }

    setActionLoading(true);
    try {
      const result = await buyNFT(marketContract, nftContract, account, tokenId, price);
      if (result.success) {
        alert(`✅ 购买成功！NFT #${tokenId}，成交价 ${weiToEth(result.price)} ETH`);
        await fetchItems();
        if (onPurchased) onPurchased();
      } else {
        alert(`❌ 购买失败: ${result.error}`);
        await fetchItems();
      }
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancel = async (tokenId) => {
    if (!account) {
      alert("请先连接钱包");
      return;
    }
    setActionLoading(true);
    const result = await cancelListing(marketContract, account, tokenId);
    if (result.success) {
      alert(`✅ 已取消上架 NFT #${tokenId}`);
      fetchItems();
    } else {
      alert(`❌ 取消失败: ${result.error}`);
    }
    setActionLoading(false);
  };

  return (
    <section id="market" className="market-section">
      <div className="section-header">
        <h2 className="section-title">NFT 交易市场</h2>
        <p className="section-desc">浏览并购买链上 NFT 数字资产</p>
        <button className="btn-refresh" onClick={fetchItems} disabled={loading}>
          {loading ? "加载中…" : "刷新"}
        </button>
      </div>

      {loading ? (
        <div className="market-loading">
          <div className="loading-spinner"></div>
          <p>正在加载市场数据...</p>
        </div>
      ) : loadError ? (
        <div className="market-empty" role="alert">
          <span className="empty-icon" aria-hidden="true">!</span>
          <p>市场加载失败：{loadError}</p>
          <button className="btn-refresh" onClick={fetchItems}>重试</button>
        </div>
      ) : items.length === 0 ? (
        <div className="market-empty">
          <span className="empty-icon" aria-hidden="true">—</span>
          <p>暂无上架的 NFT</p>
          <p className="empty-hint">去铸造页面创建你的第一个 NFT 吧！</p>
        </div>
      ) : (
        <div className="market-grid">
          {items.map((item) => (
            <NFTCard
              key={`${item.nftContract}-${item.tokenId}`}
              tokenId={item.tokenId}
              price={item.price}
              seller={item.seller}
              owner={item.owner}
              listed={item.listed}
              nftContract={nftContract}
              marketContract={marketContract}
              account={account}
              weiToEth={weiToEth}
              shortenAddress={shortenAddress}
              onBuy={handleBuy}
              onCancel={handleCancel}
              actionLoading={actionLoading}
            />
          ))}
        </div>
      )}

      {actionLoading && (
        <div className="action-overlay">
          <div className="action-modal">
            <div className="loading-spinner"></div>
            <p>交易处理中，请确认 MetaMask...</p>
          </div>
        </div>
      )}
    </section>
  );
}
