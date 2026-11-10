const fs = require("fs");
const path = require("path");

class PersistentStore {
  constructor(dataDirectory = process.env.DATA_DIR || path.join(__dirname, "../../data")) {
    this.dataDirectory = path.resolve(dataDirectory);
    this.favoritesPath = path.join(this.dataDirectory, "favorites.json");
    this.historyPath = path.join(this.dataDirectory, "history.jsonl");
    fs.mkdirSync(this.dataDirectory, { recursive: true });

    this.favorites = this._loadFavorites();
    this.history = this._loadHistory();
    this.historyKeys = new Set(this.history.map((event) => this._eventKey(event)));
  }

  _loadFavorites() {
    if (!fs.existsSync(this.favoritesPath)) return {};

    const parsed = JSON.parse(fs.readFileSync(this.favoritesPath, "utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error(`收藏数据格式无效: ${this.favoritesPath}`);
    }

    for (const [tokenId, addresses] of Object.entries(parsed)) {
      if (!Array.isArray(addresses) || addresses.some((address) => typeof address !== "string")) {
        throw new Error(`收藏数据格式无效 (Token ${tokenId}): ${this.favoritesPath}`);
      }
    }
    return parsed;
  }

  _loadHistory() {
    if (!fs.existsSync(this.historyPath)) return [];

    return fs.readFileSync(this.historyPath, "utf8")
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line, index) => {
        try {
          return JSON.parse(line);
        } catch (error) {
          throw new Error(`历史记录第 ${index + 1} 行无法解析: ${error.message}`);
        }
      });
  }

  _eventKey(event) {
    const logIndex = event.logIndex ?? event.values?.logIndex;
    return logIndex !== undefined && logIndex !== null
      ? `${event.deploymentId || "legacy"}:${event.address || ""}:${event.txHash}:${logIndex}:${event.type}`
      : `${event.deploymentId || "legacy"}:${event.type}:${event.txHash}:${event.values?.tokenId || event.values?.itemId || ""}`;
  }

  _writeFavorites(favorites) {
    const temporaryPath = `${this.favoritesPath}.${process.pid}.tmp`;
    try {
      fs.writeFileSync(temporaryPath, `${JSON.stringify(favorites, null, 2)}\n`, { mode: 0o600 });
      fs.renameSync(temporaryPath, this.favoritesPath);
    } catch (error) {
      if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath);
      throw new Error(`保存收藏数据失败: ${error.message}`);
    }
  }

  _writeHistory(history) {
    const temporaryPath = `${this.historyPath}.${process.pid}.tmp`;
    try {
      const content = history.map((event) => JSON.stringify(event)).join("\n");
      fs.writeFileSync(temporaryPath, content ? `${content}\n` : "", { mode: 0o600 });
      fs.renameSync(temporaryPath, this.historyPath);
    } catch (error) {
      if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath);
      throw new Error(`保存历史数据失败: ${error.message}`);
    }
  }

  migrateLegacyHistory(collectionAddress, marketAddress, deploymentId) {
    const activeAddresses = new Set([collectionAddress, marketAddress].map((address) => address.toLowerCase()));
    const migrated = [];
    const keys = new Set();
    let changed = false;

    for (const event of this.history) {
      const address = event.address?.toLowerCase();
      const normalizedEvent = event.deploymentId
        ? event
        : activeAddresses.has(address)
          ? { ...event, deploymentId }
          : { ...event, deploymentId: `legacy:${address || "unknown"}` };
      if (normalizedEvent !== event) changed = true;

      const key = this._eventKey(normalizedEvent);
      if (keys.has(key)) {
        changed = true;
        continue;
      }
      keys.add(key);
      migrated.push(normalizedEvent);
    }

    if (changed) {
      this._writeHistory(migrated);
      this.history.splice(0, this.history.length, ...migrated);
      this.historyKeys = keys;
    }
    return this.history.length;
  }

  toggleFavorite(tokenId, address) {
    const favorites = new Set(this.favorites[tokenId] || []);
    const isFavorite = !favorites.has(address);
    if (isFavorite) favorites.add(address);
    else favorites.delete(address);

    const nextFavorites = { ...this.favorites };
    if (favorites.size > 0) nextFavorites[tokenId] = Array.from(favorites);
    else delete nextFavorites[tokenId];
    this._writeFavorites(nextFavorites);
    this.favorites = nextFavorites;
    return { tokenId, isFavorite, favoriteCount: favorites.size };
  }

  getFavoriteState(tokenId, address) {
    const favorites = this.favorites[tokenId] || [];
    return {
      tokenId,
      favoriteCount: favorites.length,
      isFavorite: Boolean(address && favorites.includes(address)),
    };
  }

  recordHistory(event) {
    const eventKey = this._eventKey(event);
    if (this.historyKeys.has(eventKey)) return false;

    fs.appendFileSync(this.historyPath, `${JSON.stringify(event)}\n`, { mode: 0o600 });
    this.historyKeys.add(eventKey);
    this.history.push(event);
    return true;
  }
}

module.exports = new PersistentStore();
module.exports.PersistentStore = PersistentStore;
