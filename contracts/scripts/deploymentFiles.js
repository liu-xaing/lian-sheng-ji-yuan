const fs = require("fs");
const path = require("path");

function writeAtomically(filePath, content) {
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(temporaryPath, content, "utf8");
    fs.renameSync(temporaryPath, filePath);
  } catch (error) {
    if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath);
    throw error;
  }
}

function updateFrontendAddresses(filePath, deployment) {
  let content = fs.readFileSync(filePath, "utf8");
  for (const [key, address] of [
    ["NFT_COLLECTION_ADDRESS", deployment.collectionAddress],
    ["NFT_MARKET_ADDRESS", deployment.marketAddress],
  ]) {
    const pattern = new RegExp(`^export const ${key} = ["'][^"']+["'];$`, "m");
    if (!pattern.test(content)) throw new Error(`前端配置中找不到 ${key}: ${filePath}`);
    content = content.replace(pattern, `export const ${key} = "${address}";`);
  }
  writeAtomically(filePath, content);
}

function updateBackendEnvironment(filePath, deployment) {
  let content = fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";
  const values = {
    NFT_COLLECTION_ADDRESS: deployment.collectionAddress,
    NFT_MARKET_ADDRESS: deployment.marketAddress,
    DEPLOYMENT_ID: deployment.deploymentId,
  };

  for (const [key, value] of Object.entries(values)) {
    const pattern = new RegExp(`^${key}=.*$`, "m");
    if (pattern.test(content)) {
      content = content.replace(pattern, `${key}=${value}`);
    } else {
      content = `${content}${content && !content.endsWith("\n") ? "\n" : ""}${key}=${value}\n`;
    }
  }
  writeAtomically(filePath, content);
}

function persistDeployment(deployment, projectRoot) {
  const contractsDirectory = path.join(projectRoot, "contracts");
  const deploymentsPath = path.join(contractsDirectory, "deployments.json");
  const latestDeploymentPath = path.join(contractsDirectory, "deploy.json");
  const deployments = fs.existsSync(deploymentsPath)
    ? JSON.parse(fs.readFileSync(deploymentsPath, "utf8"))
    : [];

  if (!Array.isArray(deployments)) {
    throw new Error(`部署档案格式无效: ${deploymentsPath}`);
  }

  if (fs.existsSync(latestDeploymentPath)) {
    const previous = JSON.parse(fs.readFileSync(latestDeploymentPath, "utf8"));
    const previousId = previous.deploymentId ||
      `${previous.network || "unknown"}:${previous.collectionAddress}:${previous.marketAddress}`;
    if (
      previous.collectionAddress &&
      previous.marketAddress &&
      !deployments.some((entry) => entry.deploymentId === previousId)
    ) {
      deployments.push({ ...previous, deploymentId: previousId, archived: true });
    }
  }

  if (!deployments.some((entry) => entry.deploymentId === deployment.deploymentId)) {
    deployments.push(deployment);
  }
  writeAtomically(deploymentsPath, `${JSON.stringify(deployments, null, 2)}\n`);
  writeAtomically(latestDeploymentPath, `${JSON.stringify(deployment, null, 2)}\n`);

  updateFrontendAddresses(
    path.join(projectRoot, "frontend", "src", "config", "contracts.js"),
    deployment
  );
  updateBackendEnvironment(
    path.join(projectRoot, "backend", ".env"),
    deployment
  );

  return deployments.length;
}

module.exports = { persistDeployment };
