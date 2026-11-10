/**
 * Web3 钱包连接 Hook
 * 封装 MetaMask 钱包连接、账户管理、网络检测等功能
 */
import { useState, useEffect, useCallback } from "react";
import Web3 from "web3";
import { NFT_COLLECTION_ADDRESS, NFT_COLLECTION_ABI, NFT_MARKET_ADDRESS, NFT_MARKET_ABI } from "../config/contracts";

export function useWeb3() {
  const [web3, setWeb3] = useState(null);
  const [account, setAccount] = useState(null);
  const [chainId, setChainId] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [nftContract, setNftContract] = useState(null);
  const [marketContract, setMarketContract] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  // 断开连接
  const disconnectWallet = useCallback(() => {
    setWeb3(null);
    setAccount(null);
    setChainId(null);
    setIsConnected(false);
    setNftContract(null);
    setMarketContract(null);
    console.log("🔌 钱包已断开");
  }, []);

  const initializeWallet = useCallback(async (accounts) => {
    if (!accounts.length) {
      disconnectWallet();
      return;
    }

    const web3Instance = new Web3(window.ethereum);
    const chainIdHex = await window.ethereum.request({ method: "eth_chainId" });
    const currentChainId = parseInt(chainIdHex, 16);
    setWeb3(web3Instance);
    setChainId(currentChainId);
    setAccount(accounts[0]);
    setIsConnected(true);
    setNftContract(new web3Instance.eth.Contract(NFT_COLLECTION_ABI, NFT_COLLECTION_ADDRESS));
    setMarketContract(new web3Instance.eth.Contract(NFT_MARKET_ABI, NFT_MARKET_ADDRESS));
    console.log("✅ 钱包已连接:", accounts[0]);
    console.log("🔗 网络 Chain ID:", currentChainId);
  }, [disconnectWallet]);

  // 检测 MetaMask 是否可用
  const isMetaMaskAvailable = () => {
    return typeof window !== "undefined" && typeof window.ethereum !== "undefined";
  };

  // 连接钱包
  const connectWallet = useCallback(async () => {
    if (!isMetaMaskAvailable()) {
      alert("请安装 MetaMask 钱包插件！\nhttps://metamask.io/download/");
      return;
    }

    setIsLoading(true);
    try {
      const accounts = await window.ethereum.request({
        method: "eth_requestAccounts",
      });
      await initializeWallet(accounts);
    } catch (error) {
      console.error("❌ 连接失败:", error);
      alert("连接钱包失败，请重试");
    } finally {
      setIsLoading(false);
    }
  }, [initializeWallet]);

  // 恢复已授权钱包，并监听账户和网络变化
  useEffect(() => {
    if (!isMetaMaskAvailable()) return;

    let active = true;
    const restoreWallet = async () => {
      try {
        const accounts = await window.ethereum.request({ method: "eth_accounts" });
        if (active && accounts.length > 0) await initializeWallet(accounts);
      } catch (error) {
        console.error("恢复已授权钱包失败:", error);
      }
    };

    const handleAccountsChanged = (accounts) => {
      if (accounts.length === 0) {
        disconnectWallet();
      } else {
        initializeWallet(accounts).catch((error) => {
          console.error("切换钱包账户失败:", error);
        });
      }
    };

    const handleChainChanged = (chainIdHex) => {
      const newChainId = parseInt(chainIdHex, 16);
      const web3Instance = new Web3(window.ethereum);
      setWeb3(web3Instance);
      setChainId(newChainId);
      console.log("🔄 网络已切换:", newChainId);
      setNftContract(new web3Instance.eth.Contract(NFT_COLLECTION_ABI, NFT_COLLECTION_ADDRESS));
      setMarketContract(new web3Instance.eth.Contract(NFT_MARKET_ABI, NFT_MARKET_ADDRESS));
    };

    restoreWallet();
    window.ethereum.on("accountsChanged", handleAccountsChanged);
    window.ethereum.on("chainChanged", handleChainChanged);

    return () => {
      active = false;
      window.ethereum.removeListener("accountsChanged", handleAccountsChanged);
      window.ethereum.removeListener("chainChanged", handleChainChanged);
    };
  }, [disconnectWallet, initializeWallet]);

  // 获取网络名称
  const getNetworkName = (id) => {
    const networks = {
      1: "Ethereum Mainnet",
      5: "Goerli Testnet",
      11155111: "Sepolia Testnet",
      1337: "Ganache Local",
      31337: "Hardhat Local",
      137: "Polygon",
      80001: "Mumbai Testnet",
    };
    return networks[id] || `Chain ${id}`;
  };

  // 格式化地址（缩短显示）
  const shortenAddress = (addr) => {
    if (!addr) return "";
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  // 转换 Wei 到 ETH
  const weiToEth = (wei) => {
    if (!web3) return "0";
    return web3.utils.fromWei(wei.toString(), "ether");
  };

  // 转换 ETH 到 Wei
  const ethToWei = (eth) => {
    if (!web3) return "0";
    return web3.utils.toWei(eth.toString(), "ether");
  };

  return {
    web3,
    account,
    chainId,
    isConnected,
    isLoading,
    nftContract,
    marketContract,
    connectWallet,
    disconnectWallet,
    isMetaMaskAvailable,
    getNetworkName,
    shortenAddress,
    weiToEth,
    ethToWei,
  };
}
