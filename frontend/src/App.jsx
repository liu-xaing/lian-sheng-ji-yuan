/**
 * App.jsx - 主应用组件
 * 整合三层架构，协调智能合约、后端服务与前端交互
 */
import React, { useState, useCallback, useEffect } from "react";
import Header from "./components/Header";
import MarketPlace from "./components/MarketPlace";
import MintForm from "./components/MintForm";
import MyAssets from "./components/MyAssets";
import TradeHistory from "./components/TradeHistory";
import NFTDetail from "./components/NFTDetail";
import { useWeb3 } from "./hooks/useWeb3";
import "./App.css";

export default function App() {
  const [pathname, setPathname] = useState(window.location.pathname);
  useEffect(() => {
    const handlePopState = () => setPathname(window.location.pathname);
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const {
    account,
    chainId,
    isConnected,
    isLoading,
    nftContract,
    marketContract,
    connectWallet,
    disconnectWallet,
    getNetworkName,
    shortenAddress,
    weiToEth,
  } = useWeb3();

  // 刷新计数器（触发子组件重新获取数据）
  const [refreshKey, setRefreshKey] = useState(0);
  const triggerRefresh = useCallback(() => setRefreshKey((k) => k + 1), []);
  const detailMatch = pathname.match(/^\/nft\/([1-9]\d*)\/?$/);
  const isHome = pathname === "/";
  const isHistory = pathname === "/history";

  return (
    <div className="app">
      {/* 顶部导航栏 */}
      <Header
        account={account}
        isConnected={isConnected}
        chainId={chainId}
        onConnect={connectWallet}
        onDisconnect={disconnectWallet}
        shortenAddress={shortenAddress}
        getNetworkName={getNetworkName}
      />

      {/* 主内容区 */}
      <main className="main-content">
        {isHome && (
          <>
        {/* Hero 区域 */}
        <section className="hero">
          <div className="hero-kicker"><span className="status-dot" /> 去中心化数字资产市场</div>
          <h1 className="hero-title">让每一份数字创作<br /><span>都有迹可循</span></h1>
          <p className="hero-subtitle">
            链上确权、自由交易，让创作价值持续流转。
          </p>
          <div className="hero-stats">
            <div className="stat-item">
              <span className="stat-value">
                {isConnected ? shortenAddress(account) : "未连接"}
              </span>
              <span className="stat-label">当前账户</span>
            </div>
            <div className="stat-item">
              <span className="stat-value">
                {chainId ? getNetworkName(chainId) : "--"}
              </span>
              <span className="stat-label">网络</span>
            </div>
            <div className="stat-item">
              <span className={`stat-value status-value ${isConnected ? "is-connected" : ""}`}>
                <span className="status-dot" />
                {isConnected ? "已连接" : "未连接"}
              </span>
              <span className="stat-label">钱包状态</span>
            </div>
          </div>
        </section>

        {/* 未连接钱包提示 */}
        {!isConnected && (
          <div className="connect-prompt">
            <div className="prompt-card">
              <span className="prompt-icon" aria-hidden="true">W</span>
              <h3>连接钱包开始体验</h3>
              <p>请连接 MetaMask 钱包以使用铸造、交易等功能</p>
              <button className="btn-connect-prompt" onClick={connectWallet} disabled={isLoading}>
                {isLoading ? "连接中..." : "连接 MetaMask"}
              </button>
            </div>
          </div>
        )}

        {/* 交易市场 */}
        {isConnected && (
          <MarketPlace
            nftContract={nftContract}
            marketContract={marketContract}
            account={account}
            weiToEth={weiToEth}
            shortenAddress={shortenAddress}
            refreshKey={refreshKey}
            onPurchased={triggerRefresh}
          />
        )}

        {/* 铸造 NFT */}
        {isConnected && (
          <MintForm
            nftContract={nftContract}
            account={account}
            onMinted={triggerRefresh}
          />
        )}

        {/* 我的资产 */}
        {isConnected && (
          <MyAssets
            nftContract={nftContract}
            marketContract={marketContract}
            account={account}
            weiToEth={weiToEth}
            shortenAddress={shortenAddress}
            refreshKey={refreshKey}
          />
        )}
          </>
        )}

        {isHistory && (
          <TradeHistory
            account={account}
            weiToEth={weiToEth}
            shortenAddress={shortenAddress}
          />
        )}

        {detailMatch && (
          isConnected ? (
            <NFTDetail
              tokenId={detailMatch[1]}
              nftContract={nftContract}
              marketContract={marketContract}
              account={account}
              weiToEth={weiToEth}
              shortenAddress={shortenAddress}
              onChanged={triggerRefresh}
            />
          ) : (
            <div className="connect-prompt">
              <div className="prompt-card">
                <h3>连接钱包查看 NFT 详情</h3>
                <button className="btn-connect-prompt" onClick={connectWallet} disabled={isLoading}>
                  {isLoading ? "连接中..." : "连接 MetaMask"}
                </button>
              </div>
            </div>
          )
        )}

        {!isHome && !isHistory && !detailMatch && (
          <div className="connect-prompt">
            <div className="prompt-card">
              <h3>页面不存在</h3>
              <a className="btn-connect-prompt" href="/">返回首页</a>
            </div>
          </div>
        )}
      </main>

      {/* 页脚 */}
      <footer className="footer">
        <div className="footer-content">
          <div className="footer-section">
          <h4>三层技术架构</h4>
            <ul>
            <li>智能合约层：Solidity + Hardhat</li>
            <li>链下存储层：IPFS + Express</li>
            <li>前端交互层：React + Web3.js</li>
            </ul>
          </div>
          <div className="footer-section">
          <h4>功能模块</h4>
            <ul>
            <li>NFT 铸造（IPFS 元数据存储）</li>
            <li>ERC721 确权（所有权追踪）</li>
            <li>市场交易（ETH 支付）</li>
            <li>资产管理（我的 NFT）</li>
            </ul>
          </div>
          <div className="footer-section">
          <h4>技术栈</h4>
            <ul>
              <li>Solidity 0.8.20</li>
              <li>Hardhat + Web3.js</li>
              <li>IPFS (Pinata)</li>
              <li>React + Vite</li>
            </ul>
          </div>
        </div>
        <div className="footer-bottom">
          <p>© 2024 链生纪元 - NFT 确权与交易平台 Demo</p>
        </div>
      </footer>
    </div>
  );
}
