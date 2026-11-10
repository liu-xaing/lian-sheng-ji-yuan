/**
 * MintForm 组件
 * NFT 铸造表单：输入名称、描述、图片 URL、属性，提交铸造
 */
import React, { useEffect, useRef, useState } from "react";
import { mintNFT, normalizeIpfsUri, uploadImage } from "../services/contractService";
import "./MintForm.css";

export default function MintForm({ nftContract, account, onMinted }) {
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    image: "",
    trait_type: "",
    trait_value: "",
  });
  const [isMinting, setIsMinting] = useState(false);
  const [result, setResult] = useState(null);
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState("");
  const imageInputRef = useRef(null);

  useEffect(() => {
    if (!imageFile) {
      setImagePreview("");
      return undefined;
    }
    const previewUrl = URL.createObjectURL(imageFile);
    setImagePreview(previewUrl);
    return () => URL.revokeObjectURL(previewUrl);
  }, [imageFile]);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleImageFileChange = (event) => {
    const file = event.target.files?.[0] || null;
    setResult(null);
    if (!file) {
      setImageFile(null);
      return;
    }
    if (!["image/jpeg", "image/png", "image/gif", "image/webp"].includes(file.type)) {
      setImageFile(null);
      setResult({ type: "error", message: "图片仅支持 JPEG、PNG、GIF 或 WebP 格式" });
      event.target.value = "";
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setImageFile(null);
      setResult({ type: "error", message: "图片不能超过 10 MB" });
      event.target.value = "";
      return;
    }
    setImageFile(file);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const name = formData.name.trim();
    const description = formData.description.trim();
    const traitType = formData.trait_type.trim();
    const traitValue = formData.trait_value.trim();
    if (!name || !description) {
      setResult({ type: "error", message: "请填写 NFT 名称和描述" });
      return;
    }
    if (name.length > 80) {
      setResult({ type: "error", message: "NFT 名称不能超过 80 个字符" });
      return;
    }
    if (description.length > 1000) {
      setResult({ type: "error", message: "NFT 描述不能超过 1000 个字符" });
      return;
    }
    if (Boolean(traitType) !== Boolean(traitValue)) {
      setResult({ type: "error", message: "属性名称和属性值需要同时填写" });
      return;
    }
    if (traitType.length > 80 || traitValue.length > 120) {
      setResult({ type: "error", message: "属性名称最多 80 个字符，属性值最多 120 个字符" });
      return;
    }

    setIsMinting(true);
    setResult(null);

    try {
      const image = imageFile
        ? await uploadImage(imageFile)
        : formData.image.trim()
          ? normalizeIpfsUri(formData.image)
          : "https://via.placeholder.com/400x400/667eea/ffffff?text=NFT";
      const attributes = traitType
        ? [{ trait_type: traitType, value: traitValue }]
        : [];
      const metadata = { name, description, image, attributes };
      const res = await mintNFT(nftContract, account, metadata);

      if (res.success) {
        setResult({ type: "success", message: `🎉 NFT #${res.tokenId} 铸造成功！` });
        setFormData({ name: "", description: "", image: "", trait_type: "", trait_value: "" });
        setImageFile(null);
        if (imageInputRef.current) imageInputRef.current.value = "";
        if (onMinted) onMinted();
      } else {
        setResult({ type: "error", message: `铸造失败: ${res.error}` });
      }
    } catch (error) {
      console.error("图片上传或铸造失败:", error);
      setResult({
        type: "error",
        message: error.response?.data?.error || error.message || "图片上传失败，请重试",
      });
    } finally {
      setIsMinting(false);
    }
  };

  return (
    <section id="mint" className="mint-section">
      <h2 className="section-title">铸造 NFT</h2>
      <p className="section-desc">创建你的数字资产，元数据将存储到 IPFS 实现去中心化</p>

      <form className="mint-form" onSubmit={handleSubmit}>
        <div className="form-group">
          <label>NFT 名称 *</label>
          <input
            type="text"
            name="name"
            value={formData.name}
            onChange={handleChange}
            maxLength={80}
            placeholder="例如：链生纪元 #001"
            required
          />
        </div>

        <div className="form-group">
          <label>描述 *</label>
          <textarea
            name="description"
            value={formData.description}
            onChange={handleChange}
            placeholder="描述你的 NFT..."
            rows="3"
            maxLength={1000}
            required
          />
          <span className="field-counter">{formData.description.length}/1000</span>
        </div>

        <div className="form-group">
          <label>本地上传图片（可选，最大 10 MB）</label>
          <input
            ref={imageInputRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp"
            onChange={handleImageFileChange}
            disabled={isMinting}
          />
          {imagePreview && (
            <div className="mint-image-preview">
              <img src={imagePreview} alt="NFT 图片预览" />
              <button
                type="button"
                onClick={() => {
                  setImageFile(null);
                  if (imageInputRef.current) imageInputRef.current.value = "";
                }}
              >
                移除图片
              </button>
            </div>
          )}
        </div>

        <div className="form-group">
          <label>或填写图片 URL / Pinata CID（可选）</label>
          <input
            type="text"
            name="image"
            value={formData.image}
            onChange={handleChange}
            disabled={Boolean(imageFile) || isMinting}
            placeholder="https://...、ipfs://... 或 Pinata CID"
          />
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>属性名称</label>
            <input
              type="text"
              name="trait_type"
              value={formData.trait_type}
              onChange={handleChange}
              maxLength={80}
              placeholder="例如：稀有度"
            />
          </div>
          <div className="form-group">
            <label>属性值</label>
            <input
              type="text"
              name="trait_value"
              value={formData.trait_value}
              onChange={handleChange}
              maxLength={120}
              placeholder="例如：传说"
            />
          </div>
        </div>

        <button type="submit" className="btn-mint" disabled={isMinting}>
          {isMinting ? "⏳ 铸造中..." : "🚀 铸造 NFT"}
        </button>

        {result && (
          <div className={`mint-result ${result.type}`}>
            {result.message}
          </div>
        )}
      </form>
    </section>
  );
}
