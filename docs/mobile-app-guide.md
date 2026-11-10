# 将链生纪元网页改造为手机App指南

## 📱 推荐方案：Capacitor

Capacitor 是 Ionic 团队开发的跨平台框架，允许你使用 Web 技术构建原生移动应用。它是 Cordova 的现代替代品，性能更好，维护更活跃。

### 为什么选择 Capacitor？

✅ **基于现有代码**：不需要重写，直接使用 React + Vite 项目
✅ **跨平台**：一套代码同时支持 iOS、Android 和 Web
✅ **原生功能**：可以访问相机、地理位置、推送通知等原生API
✅ **应用商店**：可以打包成 APK/IPA 发布到应用商店
✅ **配置简单**：几步即可完成配置

---

## 🚀 快速开始（3步完成）

### 第一步：安装 Capacitor

```bash
# 进入前端目录
cd frontend

# 安装 Capacitor 核心包和 CLI
npm install @capacitor/core @capacitor/cli

# 初始化 Capacitor（会询问应用名称和ID）
npx cap init
```

**初始化时的提示：**
- App name: `链生纪元` 或 `NFT Market`
- App package ID: `com.yourname.nftmarket`（类似域名格式）
- Web asset dir: `dist`（Vite 默认构建目录）
- Web server URL: 留空（使用本地文件）

### 第二步：添加目标平台

```bash
# 添加 Android 平台
npx cap add android

# 添加 iOS 平台（需要 macOS 系统）
npx cap add ios
```

### 第三步：构建并运行

```bash
# 1. 构建 Web 应用
npm run build

# 2. 同步到原生项目
npx cap sync

# 3. 打开 Android Studio
npx cap open android

# 或打开 Xcode（仅 macOS）
npx cap open ios
```

---

## 📝 详细配置步骤

### 1. 安装 Capacitor

```bash
cd frontend
npm install @capacitor/core @capacitor/cli
```

### 2. 初始化配置

```bash
npx cap init
```

这会在项目根目录创建 `capacitor.config.json`：

```json
{
  "appId": "com.yourname.nftmarket",
  "appName": "链生纪元",
  "webDir": "dist",
  "server": {
    "androidScheme": "https"
  }
}
```

### 3. 修改 vite.config.js

由于 Capacitor 使用相对路径，需要调整 Vite 配置：

```javascript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './', // 添加这行，使用相对路径
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  define: {
    'process.env': {},
  },
});
```

### 4. 配置后端地址（重要！）

由于手机 App 无法访问 `localhost`，需要修改后端地址：

**方法1：修改 contracts.js**

```javascript
// frontend/src/config/contracts.js
export const API_BASE_URL = "https://your-backend-server.com"; // 使用真实服务器地址
```

**方法2：使用环境变量**

创建不同环境的配置文件：
- `.env.development` - 开发环境（localhost）
- `.env.production` - 生产环境（真实服务器）

### 5. 添加平台

```bash
# Android
npx cap add android

# iOS (需要 macOS)
npx cap add ios
```

### 6. 构建和同步

```bash
# 构建 Web 应用
npm run build

# 同步到原生项目
npx cap sync
```

### 7. 运行应用

```bash
# 方式1：在 IDE 中打开（推荐）
npx cap open android  # Android Studio
npx cap open ios      # Xcode (macOS)

# 然后在 IDE 中点击运行按钮

# 方式2：命令行运行
npx cap run android
npx cap run ios
```

---

## 🔄 开发流程

### 修改代码后更新 App

```bash
# 1. 修改代码

# 2. 重新构建
npm run build

# 3. 同步到原生项目
npx cap sync

# 4. 重新运行
npx cap run android
npx cap run ios
```

### 实时开发（热重载）

```bash
# 1. 启动开发服务器
npm run dev

# 2. 在 capacitor.config.json 中配置开发服务器
{
  "server": {
    "url": "http://192.168.1.100:5173" // 你电脑的局域网IP
  }
}

# 3. 同步并运行
npx cap sync
npx cap run android
```

---

## 📦 发布到应用商店

### Android 发布

1. **生成签名密钥**
```bash
keytool -keyalg RSA -alias androidkey -genkey -keypass android -storepass android -keystore my-release-key.jks
```

2. **构建 APK**
```bash
# 在 Android Studio 中
Build → Generate Signed Bundle / APK → APK
```

3. **发布到 Google Play**
- 注册 Google Play 开发者账号（$25）
- 创建应用列表
- 上传 APK
- 填写应用信息和截图

### iOS 发布

1. **准备 Apple 开发者账号**
- 注册 Apple Developer Program（$99/年）
- 创建 App ID
- 配置证书和描述文件

2. **在 Xcode 中配置**
- 打开项目
- 设置签名证书
- 配置 Bundle Identifier

3. **构建和上传**
```bash
# 在 Xcode 中
Product → Archive → Distribute App → App Store Connect
```

4. **发布到 App Store**
- 在 App Store Connect 中创建应用
- 上传构建版本
- 填写应用信息
- 提交审核

---

## 🎯 针对链生纪元的特殊配置

### 1. 处理 MetaMask 钱包连接

由于手机 App 中无法使用浏览器插件，需要使用 WalletConnect：

```bash
npm install @walletconnect/web3-provider
```

修改 `useWeb3.js`：
```javascript
import WalletConnectProvider from "@walletconnect/web3-provider";

const provider = new WalletConnectProvider({
  rpc: {
    1337: "http://your-server.com:7545"
  }
});
```

### 2. 处理 IPFS 图片

确保后端 API 可以被手机访问：
- 使用真实服务器地址（非 localhost）
- 配置 CORS 允许跨域访问

### 3. 配置后端服务器

由于手机无法访问 localhost，后端需要部署到：
- 云服务器（阿里云、腾讯云等）
- 内网穿透工具（ngrok、frp等）

---

## 🐛 常见问题

### Q1: 为什么我的 App 无法连接到后端？
**A**: 手机 App 无法访问 `localhost`，需要使用真实的服务器地址。可以使用：
- 云服务器
- ngrok 内网穿透
- 局域网IP（开发测试）

### Q2: MetaMask 在 App 中能用吗？
**A**: 不能直接使用浏览器插件。需要：
- 使用 WalletConnect
- 或使用 App 内嵌浏览器
- 或使用原生钱包集成

### Q3: 如何调试手机 App？
**A**: 
- Android: Chrome DevTools → chrome://inspect
- iOS: Safari → 开发 → 设备

### Q4: 构建失败怎么办？
**A**: 
```bash
# 清理缓存
npx cap clean

# 重新添加平台
npx cap add android --force

# 重新同步
npx cap sync
```

---

## 📚 参考资源

- [Capacitor 官方文档](https://capacitorjs.com/docs)
- [Capacitor Android 配置](https://capacitorjs.com/docs/android/configuration)
- [Capacitor iOS 配置](https://capacitorjs.com/docs/ios/configuration)
- [WalletConnect 文档](https://docs.walletconnect.com/)

---

## 🎉 总结

使用 Capacitor，你可以：
1. ✅ 保持现有 React + Vite 代码不变
2. ✅ 快速打包成手机 App
3. ✅ 发布到应用商店
4. ✅ 访问原生设备功能

**下一步行动**：
1. 安装 Capacitor：`npm install @capacitor/core @capacitor/cli`
2. 初始化：`npx cap init`
3. 添加平台：`npx cap add android`
4. 构建并运行：`npm run build && npx cap sync && npx cap open android`

现在你的链生纪元就可以变成手机 App 了！🚀
