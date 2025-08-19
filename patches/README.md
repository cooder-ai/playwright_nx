# Playwright Anti-Detection Patches

基于Brave-Core的patch管理方式，使用git patch来修改Playwright源代码，源代码文件保持不动。

## 🎯 核心思路

- **源代码不动** - 原始playwright代码保持干净状态
- **patch管理** - 所有反检测修改都通过patch文件管理  
- **构建时应用** - 构建过程自动应用patches，生成修改后的代码

## 📁 Patch文件结构

```
patches/
├── playwright-core-page.ts.patch              # 核心binding变量 (__playwright__binding__ → __nx_binding__)
├── playwright-core-webSocketRouteDispatcher.ts.patch  # WebSocket dispatcher变量
├── playwright-core-crDevTools.ts.patch        # DevTools binding变量
├── injected-webSocketMock.ts.patch            # WebSocket mock注入代码
├── injected-pollingRecorder.ts.patch          # Recorder相关变量
└── ... (根据需要添加更多patch)
```

## 🔧 npm命令

```bash
# 应用所有patches
npm run patches:apply

# 构建反检测版本
npm run build:anti-detection  

# 回滚所有patches (恢复原始代码)
npm run patches:rollback

# 检查patch状态
npm run patches:status

# 列出所有patches
npm run patches:list

# 基于当前修改生成新patch文件
npm run patches:update

# 清理后重新应用 (先回滚再应用)
npm run patches:clean
```

## 🔄 开发工作流

### 标准流程
```bash
# 1. 应用反检测patches
npm run patches:apply

# 2. 构建修改后的代码
npm run build

# 3. 测试反检测效果
# ... 测试代码

# 4. 需要时回滚到原始状态
npm run patches:rollback
```

### 创建新patch
```bash
# 1. 确保代码是干净状态
npm run patches:rollback

# 2. 手动修改源代码文件
# ... 编辑文件

# 3. 生成patch文件
npm run patches:update

# 4. 恢复原始代码
git checkout .

# 5. 测试patch应用
npm run patches:apply
```

## 📊 Patch内容说明

### playwright-core-page.ts.patch
- 修改核心binding变量名
- 影响所有浏览器引擎的binding机制

### injected-webSocketMock.ts.patch  
- 修改WebSocket相关的全局变量
- 影响WebSocket拦截和mock功能

### playwright-core-crDevTools.ts.patch
- 修改DevTools相关的binding名称
- 影响Chromium DevTools集成

### injected-pollingRecorder.ts.patch
- 修改Recorder相关的所有函数名
- 影响录制和调试功能

## ✅ 优势

✅ **源代码干净** - 原始playwright代码完全不动  
✅ **版本管理友好** - patch文件独立管理，便于版本控制  
✅ **上游同步简单** - 更新playwright版本时只需更新patch文件  
✅ **回滚安全** - 随时可以完全回滚到原始状态  
✅ **审查清晰** - 每个patch文件清晰显示具体修改  
✅ **构建灵活** - 可以选择性应用不同的patch组合
