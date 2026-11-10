import React, { useCallback, useEffect, useState } from "react";
import { getAccountHistory } from "../services/contractService";
import "./TradeHistory.css";

const ACTION_LABELS = {
  minted: "铸造",
  listed: "上架",
  priceUpdated: "改价",
  bought: "购买",
  sold: "售出",
  cancelled: "取消上架",
  transferred: "转出",
  received: "转入",
};

export default function TradeHistory({ account, weiToEth, shortenAddress }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchHistory = useCallback(async () => {
    if (!account) {
      setHistory([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      setHistory(await getAccountHistory(account));
    } catch (requestError) {
      console.error("读取交易历史失败:", requestError);
      setError(requestError.response?.data?.error || requestError.message || "读取交易历史失败");
    } finally {
      setLoading(false);
    }
  }, [account]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  return (
    <section className="history-section">
      <div className="section-header">
        <div>
          <h2 className="section-title">交易历史</h2>
          <p className="section-desc">记录当前钱包的铸造、上架、购买和转移活动</p>
        </div>
        <button className="btn-refresh" onClick={fetchHistory} disabled={loading}>
          {loading ? "加载中…" : "刷新"}
        </button>
      </div>

      {!account ? (
        <div className="history-message">连接钱包后查看该账户的活动记录。</div>
      ) : loading ? (
        <div className="history-message">正在读取交易历史...</div>
      ) : error ? (
        <div className="history-message history-error" role="alert">
          <p>读取失败：{error}</p>
          <button className="btn-refresh" onClick={fetchHistory}>重试</button>
        </div>
      ) : history.length === 0 ? (
        <div className="history-message">尚无活动记录。链上监听启动后产生的事件会显示在这里。</div>
      ) : (
        <div className="history-list">
          {history.map((entry, index) => (
            <article className="history-entry" key={`${entry.txHash}-${entry.action}-${index}`}>
              <div className="history-entry-main">
                <span className={`history-action ${entry.action}`}>
                  {ACTION_LABELS[entry.action] || entry.action}
                </span>
                <a href={`/nft/${entry.tokenId}`} className="history-token">
                  NFT #{entry.tokenId}
                </a>
                {entry.price && (
                  <span className="history-price">{weiToEth(entry.price)} ETH</span>
                )}
              </div>
              <div className="history-entry-meta">
                <time dateTime={new Date(entry.timestamp).toISOString()}>
                  {new Date(entry.timestamp).toLocaleString()}
                </time>
                <span title={entry.txHash}>{shortenAddress(entry.txHash)}</span>
              </div>
            </article>
          ))}
        </div>
      )}
      <p className="history-note">
        历史保存在后端本地，并会在启动时从链上同步已有事件。
      </p>
    </section>
  );
}
