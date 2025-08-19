#!/usr/bin/env node

/**
 * Playwright Anti-Detection Patch Manager
 * 基于Brave-Core的patch管理方式
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class PatchManager {
  constructor() {
    this.rootPath = path.resolve(__dirname, '..');
    this.patchesDir = path.join(this.rootPath, 'patches');
  }

  getAllPatches() {
    if (!fs.existsSync(this.patchesDir)) {
      console.log('❌ patches目录不存在');
      return [];
    }
    
    return fs.readdirSync(this.patchesDir)
      .filter(file => file.endsWith('.patch'))
      .sort()
      .map(file => path.join(this.patchesDir, file));
  }

  applyAllPatches() {
    console.log('🚀 应用反检测patches...');
    
    const patches = this.getAllPatches();
    if (patches.length === 0) {
      console.log('📁 没有找到patch文件');
      return;
    }
    
    let successCount = 0;
    let failCount = 0;
    
    for (const patchFile of patches) {
      const patchName = path.basename(patchFile);
      console.log(`📝 应用: ${patchName}`);
      
      try {
        // 先检查patch是否可以应用
        execSync(`git apply --check "${patchFile}"`, {
          cwd: this.rootPath,
          stdio: 'pipe'
        });
        
        // 应用patch
        execSync(`git apply "${patchFile}"`, {
          cwd: this.rootPath,
          stdio: 'pipe'
        });
        
        console.log(`  ✅ 成功: ${patchName}`);
        successCount++;
      } catch (error) {
        console.log(`  ❌ 失败: ${patchName}`);
        console.log(`     ${error.message.split('\n')[0]}`);
        failCount++;
      }
    }
    
    console.log(`\n📊 结果: ${successCount} 成功, ${failCount} 失败`);
    if (successCount > 0) {
      console.log('\n📋 下一步: npm run build');
    }
  }

  rollbackAllPatches() {
    console.log('🔄 回滚所有patches...');
    
    const patches = this.getAllPatches().reverse(); // 逆序回滚
    let successCount = 0;
    
    for (const patchFile of patches) {
      const patchName = path.basename(patchFile);
      console.log(`🔄 回滚: ${patchName}`);
      
      try {
        execSync(`git apply --reverse "${patchFile}"`, {
          cwd: this.rootPath,
          stdio: 'pipe'
        });
        
        console.log(`  ✅ 成功回滚: ${patchName}`);
        successCount++;
      } catch (error) {
        console.log(`  ⚠️  跳过: ${patchName} (可能未应用)`);
      }
    }
    
    console.log(`\n✅ 回滚完成: ${successCount} 个patches`);
  }

  checkStatus() {
    console.log('📊 检查patch状态...');
    
    const patches = this.getAllPatches();
    if (patches.length === 0) {
      console.log('📁 没有找到patch文件');
      return;
    }
    
    for (const patchFile of patches) {
      const patchName = path.basename(patchFile);
      
      try {
        // 检查是否已应用 (通过尝试reverse apply)
        execSync(`git apply --reverse --check "${patchFile}"`, {
          cwd: this.rootPath,
          stdio: 'pipe'
        });
        console.log(`  ✅ 已应用: ${patchName}`);
      } catch (error) {
        try {
          // 检查是否可以正常应用
          execSync(`git apply --check "${patchFile}"`, {
            cwd: this.rootPath,
            stdio: 'pipe'
          });
          console.log(`  🔄 未应用: ${patchName}`);
        } catch {
          console.log(`  ❌ 冲突: ${patchName}`);
        }
      }
    }
  }

  generateNewPatches() {
    console.log('📄 基于当前修改生成patches...');
    
    try {
      // 获取所有修改的文件
      const modifiedFiles = execSync('git diff --name-only', {
        cwd: this.rootPath,
        encoding: 'utf-8'
      }).trim().split('\n').filter(Boolean);
      
      if (modifiedFiles.length === 0) {
        console.log('📁 没有检测到修改的文件');
        return;
      }
      
      console.log(`📁 发现 ${modifiedFiles.length} 个修改的文件`);
      
      if (!fs.existsSync(this.patchesDir)) {
        fs.mkdirSync(this.patchesDir, { recursive: true });
      }
      
      for (const file of modifiedFiles) {
        if (file.match(/\.(ts|js)$/)) {
          const patchName = this.generatePatchName(file);
          const patchFile = path.join(this.patchesDir, patchName);
          
          // 生成单个文件的patch
          const diff = execSync(`git diff -- "${file}"`, {
            cwd: this.rootPath,
            encoding: 'utf-8'
          });
          
          if (diff.trim()) {
            fs.writeFileSync(patchFile, diff);
            console.log(`  ✅ 生成: ${patchName}`);
          }
        }
      }
      
      console.log('\n✅ Patch文件生成完成');
      console.log('📋 下一步: git checkout . && npm run patches:apply');
    } catch (error) {
      console.error(`❌ 生成失败: ${error.message}`);
    }
  }

  generatePatchName(filePath) {
    // 转换为Brave风格的patch名称
    // packages/playwright-core/src/server/page.ts → playwright-core-page.ts.patch
    const parts = filePath.split('/');
    let patchName = '';
    
    if (parts[0] === 'packages') {
      const packageName = parts[1]; // playwright-core, injected等
      const fileName = path.basename(filePath);
      patchName = `${packageName}-${fileName}.patch`;
    } else {
      patchName = filePath.replace(/[\/\\]/g, '-') + '.patch';
    }
    
    return patchName;
  }

  listPatches() {
    console.log('📋 可用的patches:');
    
    const patches = this.getAllPatches();
    if (patches.length === 0) {
      console.log('📁 没有找到patch文件');
      return;
    }
    
    for (const patchFile of patches) {
      const patchName = path.basename(patchFile);
      const patchPath = path.relative(this.rootPath, patchFile);
      console.log(`  📝 ${patchName}`);
      
      // 显示patch的简要信息
      try {
        const content = fs.readFileSync(patchFile, 'utf-8');
        const lines = content.split('\n');
        const targetFile = lines.find(line => line.startsWith('--- a/'))?.substring(6);
        if (targetFile) {
          console.log(`     目标: ${targetFile}`);
        }
      } catch (error) {
        console.log(`     ⚠️  无法读取patch内容`);
      }
    }
  }

  cleanApply() {
    console.log('🧹 清理后重新应用patches...');
    
    // 1. 先回滚所有patch
    this.rollbackAllPatches();
    
    // 2. 重新应用所有patch  
    this.applyAllPatches();
  }
}

// 主函数
function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  const manager = new PatchManager();
  
  switch (command) {
    case 'apply':
      manager.applyAllPatches();
      break;
    case 'rollback':
      manager.rollbackAllPatches();
      break;
    case 'status':
      manager.checkStatus();
      break;
    case 'update':
      manager.generateNewPatches();
      break;
    case 'list':
      manager.listPatches();
      break;
    case 'clean-apply':
      manager.cleanApply();
      break;
    default:
      console.log('📋 Playwright Anti-Detection Patch Manager');
      console.log('');
      console.log('用法:');
      console.log('  npm run patches:apply      # 应用所有patches');
      console.log('  npm run patches:rollback   # 回滚所有patches');
      console.log('  npm run patches:status     # 检查patch状态');
      console.log('  npm run patches:generate   # 基于修改生成新patches');
      console.log('  npm run patches:list       # 列出所有patches');
      console.log('  npm run patches:clean      # 清理后重新应用');
      break;
  }
}

if (require.main === module) {
  main();
}

module.exports = { PatchManager };