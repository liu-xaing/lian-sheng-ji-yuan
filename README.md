# 🔗 链生纪元 - NFT 确权与交易平台

> 基于三层技术架构的 NFT 铸造、确权与交易 Demo 项目

## 📐 三层技术架构

```
┌─────────────────────────────────────────────────────────┐
│                    前端交互层                              │
│         React + Vite + Web3.js + MetaMask                │
│    钱包连接 │ 资产展示 │ 铸造表单 │ 交易市场 │ 购买操作    │
└───────────────────────┬─────────────────────────────────┘
                        │ Web3.js / HTTP API
┌───────────────────────┼─────────────────────────────────┐
│              链下存储与服务层                               │
│         Express + IPFS (Pinata) + 事件监听                │
│    REST API │ 元数据存储 │ 区块链事件索引 │ 合约 ABI 分发   │
└───────────────────────┬─────────────────────────────────┘
                        │ Web3.js WebSocket
┌───────────────────────┼─────────────────────────────────┐
│                    智能合约层                               │
│         Solidity 0.8.20 + Hardhat                        │
│   NFTCollection(ERC721) │ NFTMarket(交易市场)             │
│   铸造确权 │ 授权转移 │ 上架交易 │ ETH 支付 │ 手续费机制   │
└─────────────────────────────────────────────────────────┘
```

## 🏗️ 项目结构

```
链生纪元/
├── contracts/                    # 智能合约层
│   ├── contracts/
│   │   ├── NFTCollection.sol    # NFT 确权合约（ERC721）
│   │   └── NFTMarket.sol        # NFT 交易市场合约
│   ├── scripts/
│   │   └── deploy.js            # 部署脚本
│   ├── test/
│   │   └── NFTMarket.test.js    # 合约测试（15+ 测试用例）
│   ├── hardhat.config.js        # Hardhat 配置
│   └── package.json
│
├── backend/                     # 链下服务层
│   ├── src/
│   │   ├── server.js            # Express 主服务
│   │   └── services/
│   │       ├── ipfs.js          # IPFS 存储服务
│   │       └── blockchain.js    # 区块链事件监听
│   ├── scripts/
│   │   └── init-ipfs.js         # IPFS 示例数据初始化
│   ├── .env                     # 环境变量配置
│   └── package.json
│
├── frontend/                    # 前端交互层
│   ├── src/
│   │   ├── App.jsx              # 主应用组件
│   │   ├── main.jsx             # 入口文件
│   │   ├── App.css              # 全局样式
│   │   ├── config/
│   │   │   └── contracts.js     # 合约地址与 ABI
│   │   ├── hooks/
│   │   │   └── useWeb3.js       # Web3 钱包连接 Hook
│   │   ├── services/
│   │   │   └── contractService.js # 合约交互服务
│   │   └── components/
│   │       ├── Header.jsx       # 导航栏 + 钱包状态
│   │       ├── MarketPlace.jsx  # 交易市场
│   │       ├── MintForm.jsx     # NFT 铸造表单
│   │       ├── MyAssets.jsx     # 我的资产
│   │       └── NFTCard.jsx      # NFT 卡片组件
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
│
└── README.md                    # 本文件
```

## 🚀 快速开始

### 环境要求

- Node.js >= 18
- MetaMask 浏览器插件
- npm 或 yarn

### 第一步：安装依赖

```bash
# 安装智能合约层依赖
cd contracts
npm install

# 安装后端服务依赖
cd ../backend
npm install

# 安装前端依赖
cd ../frontend
npm install
```

### 第二步：启动本地区块链

```bash
cd contracts
npx hardhat node
```

> 这将启动一个本地以太坊节点（端口 8545），并创建 20 个测试账户（每个 10000 ETH）


### 第三步：编译并部署合约

```bash
# 新开终端
cd contracts

# 编译合约
npx hardhat compile

# 部署到本地网络
npx hardhat run scripts/deploy.js --network localhost
```

> 部署成功后脚本会自动更新前端地址和 `backend/.env`，并将每次部署追加到 `contracts/deployments.json`；`contracts/deploy.json` 始终记录最新部署。

> 合约更新后可重新部署；部署脚本会自动同步合约地址并保留部署档案。部署后重启前后端服务。每个账户都可以自行铸造，铸造者记录为实际发起交易的钱包。

> **本地链重置提示：** `hardhat node` 默认使用临时链状态。若节点重启后旧合约地址已无代码，部署会为避免 NFT 丢失而中止。若要保留旧 NFT，请恢复原节点及其链数据后再部署；若确认不需要迁移旧 NFT、要在当前空链上全新部署，请在 PowerShell 中显式跳过迁移：
>
> ```powershell
> $env:NFT_MIGRATION_SOURCE = "none"
> npx hardhat run scripts/deploy.js --network localhost
> Remove-Item Env:NFT_MIGRATION_SOURCE
> ```
>
> 跳过迁移不会恢复旧链上的 NFT 或挂牌；该设置只影响当前终端会话。
>
> 如果原链不可恢复，但 `backend/data/history.jsonl`（或 `DATA_DIR` 指定目录下的 `history.jsonl`）保留了旧合约事件，可显式尝试从事件历史重建资产和有效挂牌：
>
> ```powershell
> $env:NFT_MIGRATION_SOURCE = "history"
> npx hardhat run scripts/deploy.js --network localhost
> Remove-Item Env:NFT_MIGRATION_SOURCE
> ```
>
> 历史恢复会校验事件组是否唯一、Token ID 和所有权记录是否连续；无法安全重建时会中止。它只能恢复事件中记录的 NFT 元数据、最终所有者和挂牌状态，不能恢复旧合约未写入事件的设置（例如市场手续费接收地址）；请先备份 `backend/data/history.jsonl`。如果存在原链备份或 RPC，优先使用原链迁移。

### 第四步：运行合约测试（可选但推荐）

```bash
cd contracts
npx hardhat test
```

### 第五步：检查部署信息

部署脚本会自动更新 `backend/.env` 和 `frontend/src/config/contracts.js`，并保留所有旧部署地址到 `contracts/deployments.json`。部署后重启后端和前端开发服务，使其加载新地址。

### 第六步：启动后端服务

```bash
cd backend
npm start
```

> 后端服务将在 http://localhost:3001 启动

### 第七步：启动前端

```bash
cd frontend
npm run dev
netstat -ano | findstr :5173
start http://localhost:5173/

```

> 前端将在 http://localhost:5173 启动

### 第八步：连接 MetaMask

1. 打开浏览器访问 http://localhost:5173
2. 点击「连接钱包」按钮
3. 在 MetaMask 中添加本地网络：
   - 网络名称：Hardhat Local
   - RPC URL：http://127.0.0.1:8545
   - Chain ID：31337
   - 货币符号：ETH
4. 导入测试账户私钥（从 hardhat node 终端输出中获取）
5. 开始体验！

## 📋 功能模块

### 1. NFT 铸造（确权）

- 填写 NFT 名称、描述、图片 URL、属性
- 元数据自动上传至 IPFS（去中心化存储）
- 任意连接的钱包账户均可调用智能合约铸造 ERC721 NFT
- 铸造者信息永久记录在链上

### 2. 市场交易

- 浏览市场上所有上架的 NFT
- 购买前确认价格，链上重新校验挂牌状态与价格后以 ETH 支付
- 购买成功后自动从市场移除，并刷新买家资产
- 实时刷新市场数据
- NFT 卡片支持收藏与详情页查看
- 查看当前钱包的链上活动历史

### 3. 资产管理

- 查看当前账户拥有的所有 NFT
- 展开查看 NFT 的完整描述与属性
- 将自有 NFT 上架到市场出售
- 自定义售价（ETH）
- 取消上架操作
- 加载失败时显示错误原因并支持重试
- **删除（销毁）NFT** - 永久销毁自己拥有的 NFT，释放资产空间

### 4. 收藏、详情与活动

- 使用 ❤️ 收藏/取消收藏 NFT，并查看链下收藏人数
- 独立 NFT 详情页展示图片、描述、属性、创作者、所有者、挂牌状态与缓存活动
- 当前所有者可在详情页上架、修改挂牌价、取消上架或销毁 NFT
- 交易历史页按当前钱包显示铸造、上架、改价、购买、售出、取消上架与转移记录
- 收藏与链上事件历史保存在后端本地数据文件中，后端重启后保留

### 5. 铸造与钱包连接

- 支持本地 JPEG/PNG/GIF/WebP 图片上传到 Pinata
- 图片最大 10 MB；名称、描述和属性字段有长度与配对校验
- MetaMask 钱包集成
- 账户/网络状态实时显示
- 自动检测账户和网络切换

## 🔧 API 接口

### 后端 REST API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/health` | 健康检查 |
| GET | `/api/contracts` | 获取合约地址和 ABI |
| POST | `/api/ipfs/upload` | 上传元数据到 IPFS |
| POST | `/api/ipfs/upload-image` | 上传图片到 Pinata（multipart 字段 `image`） |
| GET | `/api/ipfs/:hash` | 从 IPFS 获取数据 |
| POST | `/api/nft/:tokenId/favorite` | 切换钱包收藏状态（JSON `{ "address": "0x..." }`） |
| GET | `/api/nft/:tokenId/favorite-count` | 获取收藏人数，可用 `address` 查询是否已收藏 |
| GET | `/api/history/account?address=0x...` | 查询钱包历史 |
| GET | `/api/history/token/:tokenId` | 查询 NFT 活动历史 |
| GET | `/api/events` | 获取区块链事件记录 |
| GET | `/api/market/items` | 获取市场条目缓存 |

### POST /api/ipfs/upload 请求体

```json
{
  "name": "NFT 名称",
  "description": "NFT 描述",
  "image": "https://example.com/image.png",
  "attributes": [
    { "trait_type": "稀有度", "value": "传说" }
  ]
}
```

### 前端页面

- `/`：市场、铸造和我的资产
- `/history`：当前钱包的交易历史
- `/nft/:tokenId`：NFT 详情及持有者操作

> 收藏与历史数据默认保存在 `backend/data/`（收藏写入 `favorites.json`，事件追加到 `history.jsonl`），重新部署合约或重启服务都不会清除这些文件。启动时会从当前合约地址回填链上事件；部署标识用于区分不同轮次的合约事件。默认从区块 0 开始，可通过 `HISTORY_FROM_BLOCK` 和 `HISTORY_BLOCK_RANGE` 设置回填起点与区块批次。可通过 `DATA_DIR` 指定持久化目录，请确保其位于持久化磁盘/卷上。
>
> **市场数据持久化**：市场数据（上架状态、价格等）保存在 `backend/data/market.json`，重启后端服务后会自动从该文件恢复市场数据。同时，启动时也会从合约的 `getListedItems()` 接口同步当前上架状态，确保数据一致性。因此，即使重新部署合约并重启后端，只要 `market.json` 文件存在，市场数据就会保留。
>
> IPFS 上已经上传的图片和元数据不会因合约重部署而删除。旧部署地址保存在部署档案中；但新合约不会自动继承旧合约中的 NFT 所有权、挂牌状态或链上资产。如需让旧 NFT 可在新合约中交易，需要另行执行链上迁移。

## 📊 智能合约说明

### NFTCollection（NFT 确权合约）

| 函数 | 说明 |
|------|------|
| `mint(address to, string uri)` | 任意账户铸造新 NFT；铸造者记录为交易发起账户 |
| `burn(uint256 tokenId)` | 销毁 NFT（仅所有者或已授权地址可调用），永久删除 NFT |
| `ownerOf(uint256 tokenId)` | 查询 NFT 所有者 |
| `tokenURI(uint256 tokenId)` | 获取 IPFS 元数据 URI |
| `creatorOf(uint256 tokenId)` | 查询铸造者 |
| `balanceOf(address owner)` | 查询持有数量 |
| `tokensOfOwner(address owner)` | 查询拥有的所有 tokenId |
| `transferFrom(from, to, tokenId)` | 转移 NFT |
| `approve(operator, tokenId)` | 授权操作 |

### NFTMarket（交易市场合约）

| 函数 | 说明 |
|------|------|
| `listItem(nftContract, tokenId, price)` | 上架 NFT |
| `buyItem(nftContract, tokenId)` | 购买 NFT（发送 ETH） |
| `cancelListing(nftContract, tokenId)` | 取消上架 |
| `updatePrice(nftContract, tokenId, newPrice)` | 更新价格 |
| `getListedItems()` | 获取所有上架列表 |
| `getSellerItems(seller)` | 获取卖家上架列表 |
| `getBuyerItems(buyer)` | 获取买家购买列表 |

## 🔐 IPFS 配置

### 使用 Pinata（推荐）

1. 注册 [Pinata](https://pinata.cloud) 账号并创建 API Key，或创建 JWT
2. 在 `backend/.env` 中填写真实凭证（不要提交或分享凭证）：

```env
PINATA_JWT=your_jwt
# 或使用 API Key 方式：
# PINATA_API_KEY=your_api_key
# PINATA_SECRET_KEY=your_secret_key
```

配置后重启后端服务。若 Pinata 未配置或上传失败，铸造接口会报错并停止铸造，不会生成模拟 CID。

> 旧版本在未配置 Pinata 时可能生成过模拟 CID。这些 CID 对应的元数据并未上传，无法通过网关读取；请配置 Pinata 后重新铸造。

## 🧪 测试

```bash
# 运行合约测试
cd contracts
npx hardhat test

# 测试覆盖
# ✅ 铸造功能（拥有者铸造、非拥有者拒绝、creator 记录）
# ✅ 确权功能（余额查询、所有者查询、转移、授权、批量授权）
# ✅ 上架功能（成功上架、非所有者拒绝、零价格拒绝）
# ✅ 购买功能（成功购买、手续费计算、自买拒绝、余额不足拒绝）
# ✅ 取消上架
# ✅ 价格更新
```

## 📝 开发流程

```
1. 需求拆解 → 功能模块划分
2. 智能合约开发 → Solidity 编写 + Hardhat 测试
3. 合约部署 → 本地/测试网部署
4. 后端服务 → Express API + IPFS 集成
5. 前端开发 → React 组件 + Web3.js 联调
6. 端到端测试 → 全流程 Demo 验证
```

## 🛠️ 技术栈

| 层级 | 技术 |
|------|------|
| 智能合约 | Solidity 0.8.20, Hardhat, ERC721 |
| 链下存储 | IPFS, Pinata API |
| 后端服务 | Node.js, Express, Web3.js |
| 前端框架 | React 18, Vite 5 |
| 钱包交互 | Web3.js, MetaMask |
| 样式 | CSS3 (渐变 + 动画) |

## 📄 License

MIT
