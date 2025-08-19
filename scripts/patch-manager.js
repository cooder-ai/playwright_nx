#!/usr/bin/env node

/**
 * Playwright Patch Manager
 * 基于Brave-Core的patch管理方式
 * 使用git patch来修改源代码而不直接改动原文件
 */

const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');
const { glob } = require('glob');

class PatchManager {
  constructor() {
    this.rootPath = path.resolve(__dirname, '..');
    this.patchesDir = path.join(this.rootPath, 'patches');
    this.configPath = path.join(this.rootPath, 'anti-detection-config.json');
    this.patchInfoDir = path.join(this.rootPath, '.patch-info');
  }

  loadConfig() {
    try {
      const content = fs.readFileSync(this.configPath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      console.error(`❌ 加载配置文件失败: ${error.message}`);
      return null;
    }
  }

  getAllPatchFiles() {
    if (!fs.existsSync(this.patchesDir)) {
      return [];
    }
    return fs.readdirSync(this.patchesDir)
      .filter(file => file.endsWith('.patch'))
      .map(file => path.join(this.patchesDir, file));
  }

  calculateChecksum(filePath) {
    try {
      if (!fs.existsSync(filePath)) return null;
      const crypto = require('crypto');
      const content = fs.readFileSync(filePath);
      return crypto.createHash('md5').update(content).digest('hex');
    } catch (error) {
      return null;
    }
  }

  getPatchInfo(patchFile) {
    const patchName = path.basename(patchFile, '.patch');
    const infoFile = path.join(this.patchInfoDir, `${patchName}.json`);
    
    if (fs.existsSync(infoFile)) {
      try {
        return JSON.parse(fs.readFileSync(infoFile, 'utf-8'));
      } catch {
        return null;
      }
    }
    return null;
  }

  savePatchInfo(patchFile, targetFiles) {
    const patchName = path.basename(patchFile, '.patch');
    const infoFile = path.join(this.patchInfoDir, `${patchName}.json`);
    
    if (!fs.existsSync(this.patchInfoDir)) {
      fs.mkdirSync(this.patchInfoDir, { recursive: true });
    }
    
    const info = {
      patchFile: path.basename(patchFile),
      patchChecksum: this.calculateChecksum(patchFile),
      targetFiles: targetFiles.map(file => ({
        path: file,
        checksum: this.calculateChecksum(path.join(this.rootPath, file))
      })),
      appliedAt: new Date().toISOString()
    };
    
    fs.writeFileSync(infoFile, JSON.stringify(info, null, 2));
  }

  needsApply(patchFile) {
    const info = this.getPatchInfo(patchFile);
    if (!info) return true;
    
    // 检查patch文件是否改变
    const currentPatchChecksum = this.calculateChecksum(patchFile);
    if (currentPatchChecksum !== info.patchChecksum) {
      return true;
    }
    
    // 检查目标文件是否改变
    for (const target of info.targetFiles) {
      const currentChecksum = this.calculateChecksum(path.join(this.rootPath, target.path));
      if (currentChecksum !== target.checksum) {
        return true;
      }
    }
    
    return false;
  }

  applyPatch(patchFile) {
    const patchName = path.basename(patchFile);
    console.log(`📝 应用patch: ${patchName}`);
    
    try {
      // 使用git apply应用patch
      const result = execSync(`git apply --check "${patchFile}"`, {
        cwd: this.rootPath,
        stdio: 'pipe'
      });
      
      execSync(`git apply "${patchFile}"`, {
        cwd: this.rootPath,
        stdio: 'inherit'
      });
      
      console.log(`  ✅ 成功应用: ${patchName}`);
      return true;
    } catch (error) {
      console.error(`  ❌ 应用失败: ${patchName}`);
      console.error(`     ${error.message}`);
      return false;
    }
  }

  rollbackPatch(patchFile) {
    const patchName = path.basename(patchFile);
    console.log(`🔄 回滚patch: ${patchName}`);
    
    try {
      execSync(`git apply --reverse "${patchFile}"`, {
        cwd: this.rootPath,
        stdio: 'inherit'
      });
      
      console.log(`  ✅ 成功回滚: ${patchName}`);
      return true;
    } catch (error) {
      console.error(`  ❌ 回滚失败: ${patchName}`);
      console.error(`     ${error.message}`);
      return false;
    }
  }

  applyAllPatches() {
    console.log('🚀 应用所有反检测patches...');
    
    const patchFiles = this.getAllPatchFiles();
    if (patchFiles.length === 0) {
      console.log('📁 没有找到patch文件');
      return;
    }
    
    let appliedCount = 0;
    let skippedCount = 0;
    
    for (const patchFile of patchFiles) {
      if (this.needsApply(patchFile)) {
        if (this.applyPatch(patchFile)) {
          appliedCount++;
          // 更新patch信息 (需要从patch文件分析目标文件)
          const targetFiles = this.extractTargetFilesFromPatch(patchFile);
          this.savePatchInfo(patchFile, targetFiles);
        }
      } else {
        console.log(`  ⏭️  跳过 ${path.basename(patchFile)} (无需重新应用)`);
        skippedCount++;
      }
    }
    
    console.log(`✅ Patch应用完成: ${appliedCount} 个应用, ${skippedCount} 个跳过`);
  }

  rollbackAllPatches() {
    console.log('🔄 回滚所有patches...');
    
    const patchFiles = this.getAllPatchFiles().reverse(); // 逆序回滚
    let rolledBackCount = 0;
    
    for (const patchFile of patchFiles) {
      if (this.rollbackPatch(patchFile)) {
        rolledBackCount++;
      }
    }
    
    console.log(`✅ 回滚完成: ${rolledBackCount} 个patches`);
    
    // 清理patch信息
    if (fs.existsSync(this.patchInfoDir)) {
      fs.rmSync(this.patchInfoDir, { recursive: true });
      console.log('🗑️  清理patch信息目录');
    }
  }

  extractTargetFilesFromPatch(patchFile) {
    try {
      const content = fs.readFileSync(patchFile, 'utf-8');
      const lines = content.split('\n');
      const targetFiles = [];
      
      for (const line of lines) {
        // 解析 "--- a/path/to/file" 格式
        if (line.startsWith('--- a/')) {
          const filePath = line.substring(6);
          targetFiles.push(filePath);
        }
      }
      
      return targetFiles;
    } catch (error) {
      console.warn(`⚠️  无法解析patch文件: ${patchFile}`);
      return [];
    }
  }

  generatePatches() {
    console.log('📄 基于当前修改生成新的patch文件...');
    
    // 获取所有修改的文件
    try {
      const modifiedFiles = execSync('git diff --name-only', {
        cwd: this.rootPath,
        encoding: 'utf-8'
      }).trim().split('\n').filter(Boolean);
      
      if (modifiedFiles.length === 0) {
        console.log('📁 没有检测到修改的文件');
        return;
      }
      
      if (!fs.existsSync(this.patchesDir)) {
        fs.mkdirSync(this.patchesDir, { recursive: true });
      }
      
      for (const file of modifiedFiles) {
        if (file.endsWith('.ts') || file.endsWith('.js')) {
          const patchName = this.generatePatchName(file);
          const patchFile = path.join(this.patchesDir, patchName);
          
          // 生成单个文件的patch
          const diff = execSync(`git diff -- "${file}"`, {
            cwd: this.rootPath,
            encoding: 'utf-8'
          });
          
          if (diff.trim()) {
            fs.writeFileSync(patchFile, diff);
            console.log(`  ✅ 生成patch: ${patchName}`);
          }
        }
      }
      
      console.log('✅ Patch文件生成完成');
    } catch (error) {
      console.error(`❌ 生成patch失败: ${error.message}`);
    }
  }

  generatePatchName(filePath) {
    // 转换文件路径为patch名称
    // packages/playwright-core/src/server/page.ts → playwright-core-page.ts.patch
    const parts = filePath.split('/');
    const packageName = parts[1]; // playwright-core, injected, etc.
    const fileName = path.basename(filePath);
    
    return `${packageName}-${fileName}.patch`;
  }

  status() {
    console.log('📊 Patch状态检查...');
    
    const patchFiles = this.getAllPatchFiles();
    if (patchFiles.length === 0) {
      console.log('📁 没有找到patch文件');
      return;
    }
    
    for (const patchFile of patchFiles) {
      const patchName = path.basename(patchFile);
      const needsApply = this.needsApply(patchFile);
      const status = needsApply ? '🔄 需要应用' : '✅ 已应用';
      console.log(`  ${status} ${patchName}`);
    }
  }
}

// 主函数
async function main() {
  const args = process.argv.slice(2);
  const manager = new PatchManager();
  
  if (args.includes('apply')) {
    manager.applyAllPatches();
  } else if (args.includes('rollback')) {
    manager.rollbackAllPatches();
  } else if (args.includes('generate')) {
    manager.generatePatches();
  } else if (args.includes('status')) {
    manager.status();
  } else {
    console.log('📋 Playwright Patch Manager');
    console.log('');
    console.log('用法:');
    console.log('  npm run patches:apply     # 应用所有patches');
    console.log('  npm run patches:rollback  # 回滚所有patches');
    console.log('  npm run patches:generate  # 生成新的patch文件');
    console.log('  npm run patches:status    # 检查patch状态');
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error('❌ 执行失败:', error.message);
    process.exit(1);
  });
}

module.exports = { PatchManager };