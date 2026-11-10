/**
 * NFTCard 组件
 * 展示单个 NFT 卡片：图片、名称、价格、操作按钮
 */
import React, { useState, useEffect } from "react";
import {
  getFavoriteState,
  getIpfsGatewayUrls,
  getTokenMetadata,
  toggleFavorite,
} from "../services/contractService";
import "./NFTCard.css";

export default function NFTCard({
  tokenId,
  price,
  seller,
  owner,
  listed,
  nftContract,
  marketContract,
  account,
  weiToEth,
  shortenAddress,
  onBuy,
  onCancel,
  showActions = true,
  actionLoading = false,
}) {
  const [metadata, setMetadata] = useState(null);
  const [loading, setLoading] = useState(true);
  const [imageUrlIndex, setImageUrlIndex] = useState(0);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [favoriteCount, setFavoriteCount] = useState(0);
  const [isFavorite, setIsFavorite] = useState(false);
  const [favoriteLoading, setFavoriteLoading] = useState(false);
  const [favoriteError, setFavoriteError] = useState("");

  useEffect(() => {
    async function fetchMetadata() {
      if (!nftContract) return;
      console.log("🎴 正在加载 NFT 元数据, Token ID:", tokenId);
      const data = await getTokenMetadata(nftContract, tokenId);
      console.log("🎴 NFT 元数据加载完成:", data);
      setMetadata(data);
      setLoading(false);
    }
    fetchMetadata();
  }, [nftContract, tokenId]);

  useEffect(() => {
    setImageUrlIndex(0);
  }, [metadata?.metadata?.image]);

  useEffect(() => {
    let active = true;
    getFavoriteState(tokenId, account)
      .then((state) => {
        if (!active) return;
        setFavoriteCount(state.favoriteCount);
        setIsFavorite(state.isFavorite);
        setFavoriteError("");
      })
      .catch((error) => {
        if (!active) return;
        console.error("获取 NFT 收藏状态失败:", error);
        setFavoriteError(error.response?.data?.error || "收藏信息暂时不可用");
      });
    return () => {
      active = false;
    };
  }, [tokenId, account]);

  const handleFavorite = async () => {
    if (!account) {
      setFavoriteError("连接钱包后才能收藏 NFT");
      return;
    }
    setFavoriteLoading(true);
    setFavoriteError("");
    try {
      const result = await toggleFavorite(tokenId, account);
      setFavoriteCount(result.favoriteCount);
      setIsFavorite(result.isFavorite);
    } catch (error) {
      console.error("更新 NFT 收藏状态失败:", error);
      setFavoriteError(error.response?.data?.error || error.message || "收藏操作失败，请重试");
    } finally {
      setFavoriteLoading(false);
    }
  };

  const handleBuy = async () => {
    if (onBuy) await onBuy(tokenId, price);
  };

  const handleCancel = async () => {
    if (onCancel) await onCancel(tokenId);
  };

  // 处理图片加载错误
  const handleImageError = () => {
    console.warn("⚠️ 图片加载失败, Token ID:", tokenId);
    setImageUrlIndex((index) => index + 1);
  };

  if (loading) {
    return (
      <div className="nft-card loading">
        <div className="card-skeleton">
          <div className="skeleton-image"></div>
          <div className="skeleton-text"></div>
          <div className="skeleton-text short"></div>
        </div>
      </div>
    );
  }

  const isOwner = account && owner && owner.toLowerCase() === account.toLowerCase();
  const isSeller = account && seller && seller.toLowerCase() === account.toLowerCase();

  // 获取图片 URL
  const imageUrls = metadata?.metadata?.image
    ? getIpfsGatewayUrls(metadata.metadata.image)
    : [];
  const imageUrl = imageUrls[imageUrlIndex];

  return (
    <div className={`nft-card ${listed ? "listed" : "owned"}`}>
      <div className="card-image">
        {imageUrl ? (
          <img 
            src={imageUrl} 
            alt={metadata.metadata.name} 
            onError={handleImageError}
          />
        ) : (
          <div className="card-image-placeholder" aria-label="NFT 图片暂不可用">NFT</div>
        )}
        <button
          type="button"
          className={`favorite-button ${isFavorite ? "active" : ""}`}
          aria-label={isFavorite ? "取消收藏" : "收藏 NFT"}
          aria-pressed={isFavorite}
          disabled={favoriteLoading}
          onClick={handleFavorite}
        >
          {isFavorite ? "❤️" : "🤍"} <span>{favoriteCount}</span>
        </button>
        {listed && (
          <span className="card-badge">在售</span>
        )}
      </div>

      <div className="card-info">
        <h3 className="card-title">{metadata?.metadata?.name || `NFT #${tokenId}`}</h3>
        <a className="card-detail-link" href={`/nft/${tokenId}`}>打开 NFT 详情 →</a>
        <p className="card-desc">{metadata?.metadata?.description || "暂无描述"}</p>
        <button
          type="button"
          className="btn-details"
          aria-expanded={detailsOpen}
          onClick={() => setDetailsOpen((open) => !open)}
        >
          {detailsOpen ? "收起详情" : "查看详情"}
        </button>
        {detailsOpen && (
          <div className="card-details">
            <p>{metadata?.metadata?.description || "暂无描述"}</p>
            {metadata?.metadata?.attributes?.length > 0 && (
              <dl className="card-attributes">
                {metadata.metadata.attributes.map((attribute, index) => (
                  <div key={`${attribute.trait_type}-${index}`}>
                    <dt>{attribute.trait_type}</dt>
                    <dd>{attribute.value}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
        )}

        <div className="card-meta">
          <div className="meta-item">
            <span className="meta-label">Token ID</span>
            <span className="meta-value">#{tokenId}</span>
          </div>
          {metadata?.owner && (
            <div className="meta-item">
              <span className="meta-label">所有者</span>
              <span className="meta-value">{shortenAddress(metadata.owner)}</span>
            </div>
          )}
          {metadata?.creator && (
            <div className="meta-item">
              <span className="meta-label">创作者</span>
              <span className="meta-value">{shortenAddress(metadata.creator)}</span>
            </div>
          )}
        </div>

        {price && (
          <div className="card-price">
            <span className="price-label">价格</span>
            <span className="price-value">💰 {weiToEth(price)} ETH</span>
          </div>
        )}
        {favoriteError && <p className="favorite-error" role="status">{favoriteError}</p>}
      </div>

      {showActions && (
        <div className="card-actions">
          {listed && (
            <button
              className="btn-buy"
              onClick={handleBuy}
              disabled={actionLoading || isSeller}
              title={isSeller ? "不能购买自己上架的 NFT" : undefined}
            >
              {isSeller
                ? "这是你发布的 NFT"
                : actionLoading
                  ? "⏳ 交易处理中..."
                  : "🛒 购买"}
            </button>
          )}
          {isSeller && listed && (
            <button className="btn-cancel" onClick={handleCancel}>
              ❌ 取消上架
            </button>
          )}
          {!listed && isOwner && (
            <span className="card-owned-badge">✅ 我的资产</span>
          )}
        </div>
      )}
    </div>
  );
}
