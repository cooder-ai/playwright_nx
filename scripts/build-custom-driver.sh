#!/bin/bash

# 构建修改后的Node.js Playwright driver包
# 用于Python playwright的集成

set -e

echo "🚀 构建自定义Playwright driver包..."

# 1. 应用反检测修改
echo "🔧 应用反检测变量替换..."
python3 scripts/apply-anti-detection.py

# 2. 构建Node.js版本
echo "📦 构建Node.js Playwright..."
npm install
npm run build

# 3. 打包driver
echo "📁 创建driver包..."
DRIVER_DIR="driver-output"
mkdir -p $DRIVER_DIR

# 复制必要文件到driver包
cp -r packages/playwright-core/lib $DRIVER_DIR/
cp -r packages/playwright-core/bin $DRIVER_DIR/
cp packages/playwright-core/package.json $DRIVER_DIR/

# 下载对应的Node.js二进制文件
NODE_VERSION="18.17.0"  # Playwright 1.52.0使用的Node.js版本
PLATFORM="darwin-x64"   # 根据系统调整

echo "⬇️  下载Node.js二进制文件..."
curl -L -o node-${NODE_VERSION}-${PLATFORM}.tar.gz \
  "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-${PLATFORM}.tar.gz"

tar -xzf node-${NODE_VERSION}-${PLATFORM}.tar.gz
cp node-v${NODE_VERSION}-${PLATFORM}/bin/node $DRIVER_DIR/node
rm -rf node-v${NODE_VERSION}-${PLATFORM}*

# 4. 创建CLI入口
cat > $DRIVER_DIR/cli.js << 'EOF'
#!/usr/bin/env node
require('./lib/cli/cli.js');
EOF

chmod +x $DRIVER_DIR/cli.js

# 5. 打包为zip
ZIP_NAME="playwright-1.52.0-mac-custom.zip"
cd $DRIVER_DIR
zip -r ../$ZIP_NAME .
cd ..

echo "✅ 自定义driver包已创建: $ZIP_NAME"
echo "🔗 设置环境变量: export LOCAL_PLAYWRIGHT_DRIVER_PATH=$(pwd)/$ZIP_NAME"

# 6. 设置环境变量供Python使用
export LOCAL_PLAYWRIGHT_DRIVER_PATH="$(pwd)/$ZIP_NAME"
echo "LOCAL_PLAYWRIGHT_DRIVER_PATH=$LOCAL_PLAYWRIGHT_DRIVER_PATH" > .env.local

echo "🎯 现在可以构建Python wheel包了: cd ../playwright-python_nx && python setup.py bdist_wheel"