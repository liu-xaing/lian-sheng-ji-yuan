import React, { useCallback, useEffect, useState } from "react";
import {
  buyNFT,
  cancelListing,
  getIpfsGatewayUrls,
  getTokenHistory,
  getTokenMetadata,
  listItem,
  updateListingPrice,
  burnNFT,
} from "../services/contractService";
import "./NFTDetail.css";

const HISTORY_LABELS = {
  NFTMinted: "铸造",
  ItemListed: "上架",
  ItemSold: "成交",
  ItemCancelled: "取消上架",
  Transfer: "所有权转移",
};

export default function NFTDetail({
  tokenId,
  nftContract,
  marketContract,
  account,
  weiToEth,
  shortenAddress,
  onChanged,
}) {
  const [metadata, setMetadata] = useState(null);
  const [history, setHistory] = useState([]);
  const [listing, setListing] = useState(null);
  const [imageUrlIndex, setImageUrlIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [price, setPrice] = useState("");
  const [busy, setBusy] = useState(false);

  const fetchDetails = useCallback(async () => {
    if (!nftContract || !marketContract) return;
    setLoading(true);
    setError("");
    try {
      const [tokenData, tokenHistory] = await Promise.all([
        getTokenMetadata(nftContract, tokenId),
        getTokenHistory(tokenId),
      ]);
      if (!tokenData) throw new Error("无法读取 NFT 链上数据，请确认网络和 Token ID");

      const itemId = await marketContract.methods
        .tokenToItem(nftContract.options.address, tokenId)
        .call();
      let currentListing = null;
      if (BigInt(itemId) > 0n) {
        const item = await marketContract.methods.items(itemId).call();
        if (item.listed) currentListing = { ...item, itemId: itemId.toString() };
      }

      setMetadata(tokenData);
      setHistory(tokenHistory);
      setListing(currentListing);
      if (currentListing) setPrice(weiToEth(currentListing.price));
    } catch (loadError) {
      console.error("读取 NFT 详情失败:", loadError);
      setError(loadError.response?.data?.error || loadError.message || "读取 NFT 详情失败");
    } finally {
      setLoading(false);
    }
  }, [nftContract, marketContract, tokenId, weiToEth]);

  useEffect(() => {
    fetchDetails();
  }, [fetchDetails]);

  useEffect(() => {
    setImageUrlIndex(0);
  }, [metadata?.metadata?.image]);

  const runAction = async (action, successMessage) => {
    setBusy(true);
    try {
      const result = await action();
      if (!result.success) {
        window.alert(`操作失败：${result.error}`);
        return;
      }
      window.alert(successMessage);
      await fetchDetails();
      if (onChanged) onChanged();
    } finally {
      setBusy(false);
    }
  };

  const handleListing = () => {
    if (!price.trim() || !Number.isFinite(Number(price)) || Number(price) <= 0) {
      window.alert("请输入大于 0 的有效价格");
      return;
    }
    runAction(
      () => listItem(nftContract, marketContract, account, tokenId, price),
      `NFT #${tokenId} 已上架`
    );
  };

  const handlePriceUpdate = () => {
    if (!price.trim() || !Number.isFinite(Number(price)) || Number(price) <= 0) {
      window.alert("请输入大于 0 的有效价格");
      return;
    }
    runAction(
      () => updateListingPrice(marketContract, nftContract, account, tokenId, price),
      "挂牌价格已更新"
    );
  };

  const handleCancel = () => {
    if (!window.confirm(`确定取消 NFT #${tokenId} 的上架吗？`)) return;
    runAction(
      () => cancelListing(marketContract, account, tokenId, nftContract.options.address),
      "已取消上架"
    );
  };

  const handleBurn = () => {
    if (!window.confirm(`确定销毁 NFT #${tokenId}？此操作不可恢复。`)) return;
    runAction(() => burnNFT(nftContract, account, tokenId), "NFT 已销毁");
  };

  const handleBuy = () => {
    if (!listing) return;
    if (!window.confirm(`确认以 ${weiToEth(listing.price)} ETH 购买 NFT #${tokenId}？`)) return;
    runAction(
      () => buyNFT(marketContract, nftContract, account, tokenId, listing.price),
      "购买成功"
    );
  };

  if (loading) return <div className="nft-detail-message">正在加载 NFT 详情...</div>;
  if (error) {
    return (
      <div className="nft-detail-message" role="alert">
        <p>{error}</p>
        <button className="btn-refresh" onClick={fetchDetails}>重试</button>
      </div>
    );
  }

  const data = metadata.metadata;
  const owner = metadata.owner;
  const isOwner = account?.toLowerCase() === owner?.toLowerCase();
  const imageUrls = data.image ? getIpfsGatewayUrls(data.image) : [];
  const imageUrl = imageUrls[imageUrlIndex];

  return (
    <main className="nft-detail-page">
      <a className="detail-back-link" href="/#market">← 返回市场</a>
      <div className="nft-detail-layout">
        <div className="nft-detail-image">
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={data.name || `NFT #${tokenId}`}
              onError={() => setImageUrlIndex((index) => index + 1)}
            />
          ) : <span className="detail-image-placeholder">NFT</span>}
        </div>
        <section className="nft-detail-info">
          <p className="detail-eyebrow">TOKEN #{tokenId}</p>
          <h1>{data.name || `NFT #${tokenId}`}</h1>
          <p className="detail-description">{data.description || "暂无描述"}</p>

          <dl className="detail-properties">
            <div><dt>创作者</dt><dd>{metadata.creator ? shortenAddress(metadata.creator) : "未知"}</dd></div>
            <div><dt>当前所有者</dt><dd>{owner ? shortenAddress(owner) : "未知"}</dd></div>
            <div><dt>市场状态</dt><dd>{listing ? `在售 · ${weiToEth(listing.price)} ETH` : "未上架"}</dd></div>
          </dl>

          {data.attributes?.length > 0 && (
            <div className="detail-attributes">
              <h2>属性</h2>
              <div className="detail-attribute-grid">
                {data.attributes.map((attribute, index) => (
                  <div key={`${attribute.trait_type}-${index}`}>
                    <span>{attribute.trait_type}</span>
                    <strong>{attribute.value}</strong>
                  </div>
                ))}
              </div>
            </div>
          )}

          {isOwner && (
            <div className="detail-owner-actions">
              <label>
                挂牌价格 (ETH)
                <input
                  type="number"
                  min="0.000000000000000001"
                  step="any"
                  value={price}
                  onChange={(event) => setPrice(event.target.value)}
                  disabled={busy}
                />
              </label>
              {listing ? (
                <>
                  <button onClick={handlePriceUpdate} disabled={busy}>修改价格</button>
                  <button className="detail-danger" onClick={handleCancel} disabled={busy}>取消上架</button>
                </>
              ) : (
                <button onClick={handleListing} disabled={busy}>上架出售</button>
              )}
              {!listing && (
                <button className="detail-danger" onClick={handleBurn} disabled={busy}>销毁 NFT</button>
              )}
              {listing && <p className="detail-action-hint">请先取消上架，再销毁此 NFT。</p>}
            </div>
          )}
          {listing && !isOwner && (
            <button className="detail-buy-button" onClick={handleBuy} disabled={busy || !account}>
              {busy ? "交易处理中..." : `购买 · ${weiToEth(listing.price)} ETH`}
            </button>
          )}
        </section>
      </div>

      <section className="nft-detail-history">
        <h2>活动记录</h2>
        {history.length === 0 ? (
          <p>暂无链上活动记录。请确认后端已连接当前网络，并刷新页面重试。</p>
        ) : (
          history.map((event, index) => (
            <div className="detail-history-row" key={`${event.txHash}-${event.type}-${index}`}>
              <span>{HISTORY_LABELS[event.type] || event.type}</span>
              {(event.values.price || event.values.newPrice) && (
                <strong>{weiToEth(event.values.price || event.values.newPrice)} ETH</strong>
              )}
              <time>{new Date(event.timestamp).toLocaleString()}</time>
              <code title={event.txHash}>{shortenAddress(event.txHash)}</code>
            </div>
          ))
        )}
      </section>
    </main>
  );
}
