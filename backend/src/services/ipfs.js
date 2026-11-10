/**
 * IPFS 服务模块
 * 使用 Pinata 作为 IPFS 网关（也可替换为本地 IPFS 节点）
 * 负责 NFT 元数据的去中心化存储与读取
 */
const axios = require("axios");
const FormData = require("form-data");

class IPFSService {
  constructor() {
    this.pinataJwt = process.env.PINATA_JWT || "";
    this.pinataApiKey = process.env.PINATA_API_KEY || "";
    this.pinataSecretKey = process.env.PINATA_SECRET_KEY || "";
    this.gateway = process.env.IPFS_GATEWAY || "https://gateway.pinata.cloud/ipfs/";
  }

  /**
   * 获取 Pinata 认证请求头
   * 优先使用 JWT，其次使用 API Key + Secret Key
   */
  _getAuthHeaders(contentType = "application/json") {
    if (this.pinataJwt && this.pinataJwt !== "your_jwt_token_here") {
      return {
        Authorization: `Bearer ${this.pinataJwt}`,
        "Content-Type": contentType,
      };
    }
    if (this.pinataApiKey && this.pinataSecretKey) {
      return {
        pinata_api_key: this.pinataApiKey,
        pinata_secret_api_key: this.pinataSecretKey,
        "Content-Type": contentType,
      };
    }
    return null;
  }

  /**
   * 检查是否已配置 Pinata 认证
   */
  _isConfigured() {
    return (
      (this.pinataJwt && this.pinataJwt !== "your_jwt_token_here") ||
      (this.pinataApiKey && this.pinataSecretKey)
    );
  }

  /**
   * 上传 JSON 数据到 IPFS
   * @param {Object} data - 要上传的数据
   * @returns {string} IPFS Hash (CID)
   */
  async uploadJSON(data) {
    const url = "https://api.pinata.cloud/pinning/pinJSONToIPFS";
    const formData = {
      pinataContent: data,
      pinataMetadata: {
        name: `nft-metadata-${Date.now()}`,
      },
    };

    const headers = this._getAuthHeaders();
    if (!headers) {
      throw new Error("Pinata 未配置，请在 backend/.env 中设置 PINATA_JWT 或 Pinata API Key");
    }

    try {
      const response = await axios.post(url, formData, { headers });
      if (!response.data.IpfsHash) {
        throw new Error("Pinata 响应中缺少 IpfsHash");
      }
      return response.data.IpfsHash;
    } catch (error) {
      const detail = error.response?.data?.error || error.response?.data?.message || error.message;
      console.error("IPFS 上传失败:", detail);
      throw new Error(`Pinata 元数据上传失败: ${detail}`);
    }
  }

  /**
   * 上传文件到 IPFS
   * @param {Buffer} fileBuffer - 文件内容
   * @param {string} fileName - 文件名
   * @returns {string} IPFS Hash (CID)
   */
  async uploadFile(fileBuffer, fileName, contentType = "application/octet-stream") {
    const url = "https://api.pinata.cloud/pinning/pinFileToIPFS";
    const formData = new FormData();
    formData.append("file", fileBuffer, { filename: fileName, contentType });

    const headers = this._getAuthHeaders();
    if (!headers) {
      throw new Error("Pinata 未配置，请在 backend/.env 中设置 PINATA_JWT 或 Pinata API Key");
    }

    try {
      const response = await axios.post(url, formData, {
        headers: {
          ...headers,
          ...formData.getHeaders(),
        },
        maxContentLength: Infinity,
      });
      if (!response.data.IpfsHash) {
        throw new Error("Pinata 响应中缺少 IpfsHash");
      }
      return response.data.IpfsHash;
    } catch (error) {
      const detail = error.response?.data?.error || error.response?.data?.message || error.message;
      console.error("IPFS 文件上传失败:", detail);
      throw new Error(`Pinata 文件上传失败: ${detail}`);
    }
  }

  /**
   * 从 IPFS 读取数据
   * @param {string} hash - IPFS Hash (CID)
   * @returns {Object} 解析后的 JSON 数据
   */
  async getJSON(hash) {
    const gateway = this.gateway.endsWith("/") ? this.gateway : `${this.gateway}/`;
    const url = `${gateway}${hash}`;
    try {
      const response = await axios.get(url, { timeout: 10000 });
      return response.data;
    } catch (error) {
      const detail = error.response?.status
        ? `HTTP ${error.response.status}`
        : error.message;
      console.error(`IPFS 读取失败 (${hash}):`, detail);
      throw new Error(`无法从 IPFS 网关读取元数据: ${detail}`);
    }
  }

  /**
   * 从 IPFS 网关读取图片文件
   * @param {string} cid - IPFS CID
   * @returns {{ data: Buffer, contentType: string }} 图片内容和 MIME 类型
   */
  async getFile(cid) {
    const gateways = [
      this.gateway,
      "https://dweb.link/ipfs/",
      "https://ipfs.io/ipfs/",
    ];
    let lastError;

    for (const gateway of [...new Set(gateways)]) {
      const baseUrl = gateway.endsWith("/") ? gateway : `${gateway}/`;
      try {
        const response = await axios.get(`${baseUrl}${encodeURIComponent(cid)}`, {
          responseType: "arraybuffer",
          timeout: 15000,
          maxContentLength: 50 * 1024 * 1024,
        });
        return {
          data: response.data,
          contentType: response.headers["content-type"] || "application/octet-stream",
        };
      } catch (error) {
        lastError = error;
        console.warn(`IPFS 文件网关读取失败 (${gateway}):`, error.message);
      }
    }

    const detail = lastError?.response?.status
      ? `HTTP ${lastError.response.status}`
      : lastError?.message || "没有可用的 IPFS 网关";
    throw new Error(`无法从 IPFS 网关读取文件: ${detail}`);
  }

  /**
   * 生成标准 NFT 元数据（符合 OpenSea 标准）
   * @param {Object} params - 元数据参数
   * @returns {Object} 标准 NFT 元数据
   */
  createMetadata({ name, description, image, attributes = [] }) {
    return {
      name,
      description,
      image,
      attributes: attributes.map((attr) => ({
        trait_type: attr.trait_type,
        value: attr.value,
      })),
      created_at: new Date().toISOString(),
    };
  }
}

module.exports = new IPFSService();
