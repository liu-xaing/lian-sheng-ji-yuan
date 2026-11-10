/**
 * Header 组件
 * 显示平台 Logo、导航菜单、钱包连接状态
 */
import React from "react";
import "./Header.css";

export default function Header({ account, isConnected, chainId, onConnect, onDisconnect, shortenAddress, getNetworkName }) {
  return (
    <header className="header">
      <div className="header-left">
      <a className="logo" href="/" aria-label="链生纪元首页">
          <span className="logo-icon">🔗</span>
          <span className="logo-text">链生纪元</span>
        </a>
        <nav className="nav">
          <a href="/#market" className="nav-link">市场</a>
          <a href="/#mint" className="nav-link">铸造</a>
          <a href="/#assets" className="nav-link">我的资产</a>
          <a href="/history" className="nav-link">交易历史</a>
        </nav>
      </div>

      <div className="header-right">
        {isConnected ? (
          <div className="wallet-info">
            <span className="network-badge">
              <span className="status-dot" aria-hidden="true" />
              {getNetworkName(chainId)}
            </span>
            <span className="account-badge">
              {shortenAddress(account)}
            </span>
            <button className="btn-disconnect" onClick={onDisconnect}>
              断开
            </button>
          </div>
        ) : (
          <button className="btn-connect" onClick={onConnect}>
            连接钱包
          </button>
        )}
      </div>
    </header>
  );
}
