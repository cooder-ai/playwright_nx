#!/usr/bin/env node

/**
 * Playwright反检测变量替换脚本
 * 基于 anti-detection-config.json 配置文件
 * 使用 Node.js 实现，支持 npm 运行
 */

const fs = require('fs');
const path = require('path');
const { glob } = require('glob');

class AntiDetectionModifier {
  constructor(configPath = 'anti-detection-config.json') {
    this.rootPath = path.resolve(__dirname, '..');
    this.configPath = path.join(this.rootPath, configPath);
    this.config = this.loadConfig();
    this.backupDir = path.join(this.rootPath, '.anti-detection-backup');
  }

  loadConfig() {
    try {
      const content = fs.readFileSync(this.configPath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      console.error(`❌ 加载配置文件失败: ${error.message}`);
      process.exit(1);
    }
  }

  async scanAllFiles() {
    const targetFiles = new Set();
    
    // 优先处理配置中指定的目标文件
    for (const targetFile of this.config.file_patterns.target_files) {
      const filePath = path.join(this.rootPath, targetFile);
      if (fs.existsSync(filePath)) {
        targetFiles.add(filePath);
      }
    }
    
    // 扫描其他相关文件
    const searchDirs = [
      'packages/playwright-core/src',
      'packages/injected/src',
      'packages/playwright-ct-core/src'
    ];
    
    for (const searchDir of searchDirs) {
      const dirPath = path.join(this.rootPath, searchDir);
      if (fs.existsSync(dirPath)) {
        for (const pattern of this.config.file_patterns.search_patterns) {
          const cleanPattern = pattern.replace('**/', '');
          const globPattern = path.join(dirPath, '**', `*${cleanPattern.slice(1)}`);
          try {
            const files = await glob(globPattern);
            files.forEach(file => targetFiles.add(file));
          } catch (error) {
            console.warn(`⚠️  扫描模式失败 ${globPattern}: ${error.message}`);
          }
        }
      }
    }
    
    return Array.from(targetFiles).filter(file => fs.existsSync(file));
  }

  backupOriginalFiles(targetFiles) {
    if (this.config.sync_strategy.backup_original) {
      console.log('📁 备份原始文件...');
      
      if (!fs.existsSync(this.backupDir)) {
        fs.mkdirSync(this.backupDir, { recursive: true });
      }
      
      for (const filePath of targetFiles) {
        const relPath = path.relative(this.rootPath, filePath);
        const backupPath = path.join(this.backupDir, relPath);
        const backupDirPath = path.dirname(backupPath);
        
        if (!fs.existsSync(backupDirPath)) {
          fs.mkdirSync(backupDirPath, { recursive: true });
        }
        
        fs.copyFileSync(filePath, backupPath);
        console.log(`  备份: ${relPath}`);
      }
    }
  }

  applyReplacements(targetFiles) {
    console.log('🔧 应用反检测变量替换...');
    
    // 合并所有变量替换规则
    const allReplacements = {};
    for (const [category, mappings] of Object.entries(this.config.variable_replacements)) {
      Object.assign(allReplacements, mappings);
    }
    
    const modifiedFiles = [];
    
    for (const filePath of targetFiles) {
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        let modifiedContent = content;
        const replacementsMade = [];
        
        // 应用所有替换规则
        for (const [oldVar, newVar] of Object.entries(allReplacements)) {
          if (modifiedContent.includes(oldVar)) {
            modifiedContent = modifiedContent.replace(new RegExp(oldVar, 'g'), newVar);
            replacementsMade.push(`${oldVar} -> ${newVar}`);
          }
        }
        
        if (modifiedContent !== content) {
          fs.writeFileSync(filePath, modifiedContent, 'utf-8');
          
          const relPath = path.relative(this.rootPath, filePath);
          modifiedFiles.push(relPath);
          console.log(`  ✅ 修改 ${relPath}: ${replacementsMade.join(', ')}`);
        }
      } catch (error) {
        const relPath = path.relative(this.rootPath, filePath);
        console.error(`  ❌ 处理失败 ${relPath}: ${error.message}`);
      }
    }
    
    return modifiedFiles;
  }

  rollback() {
    if (!fs.existsSync(this.backupDir)) {
      console.error('❌ 没有找到备份目录');
      return;
    }
    
    console.log('🔄 回滚修改...');
    let restoredCount = 0;
    
    // 递归恢复所有备份文件
    const restoreFiles = (dir) => {
      const items = fs.readdirSync(dir);
      
      for (const item of items) {
        const backupPath = path.join(dir, item);
        const stat = fs.statSync(backupPath);
        
        if (stat.isDirectory()) {
          restoreFiles(backupPath);
        } else {
          const relPath = path.relative(this.backupDir, backupPath);
          const originalPath = path.join(this.rootPath, relPath);
          
          if (fs.existsSync(originalPath)) {
            fs.copyFileSync(backupPath, originalPath);
            console.log(`  ✅ 恢复: ${relPath}`);
            restoredCount++;
          }
        }
      }
    };
    
    restoreFiles(this.backupDir);
    console.log(`✅ 回滚完成，恢复了 ${restoredCount} 个文件`);
  }

  validateModifications(targetFiles) {
    console.log('🔍 验证修改结果...');
    
    const allReplacements = {};
    for (const [category, mappings] of Object.entries(this.config.variable_replacements)) {
      Object.assign(allReplacements, mappings);
    }
    
    for (const filePath of targetFiles) {
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const relPath = path.relative(this.rootPath, filePath);
        
        // 检查原始变量是否还存在
        const remainingVars = [];
        for (const oldVar of Object.keys(allReplacements)) {
          if (content.includes(oldVar)) {
            remainingVars.push(oldVar);
          }
        }
        
        if (remainingVars.length > 0) {
          console.log(`  ⚠️  ${relPath} 中仍有原始变量: ${remainingVars.join(', ')}`);
        }
        
        // 检查新变量是否存在
        const newVarsFound = [];
        for (const newVar of Object.values(allReplacements)) {
          if (content.includes(newVar)) {
            newVarsFound.push(newVar);
          }
        }
        
        if (newVarsFound.length > 0) {
          console.log(`  ✅ ${relPath} 中找到新变量: ${newVarsFound.join(', ')}`);
        }
      } catch (error) {
        const relPath = path.relative(this.rootPath, filePath);
        console.error(`  ❌ 验证失败 ${relPath}: ${error.message}`);
      }
    }
  }

  async apply() {
    console.log('🚀 开始应用Playwright反检测修改...');
    console.log(`📝 配置: ${this.config.description}`);
    
    // 1. 扫描所有文件
    const targetFiles = await this.scanAllFiles();
    console.log(`📁 发现 ${targetFiles.length} 个文件需要处理`);
    
    // 2. 备份原始文件
    this.backupOriginalFiles(targetFiles);
    
    // 3. 应用替换
    const modifiedFiles = this.applyReplacements(targetFiles);
    
    // 4. 验证修改
    this.validateModifications(targetFiles.filter(f => {
      const relPath = path.relative(this.rootPath, f);
      return modifiedFiles.includes(relPath);
    }));
    
    console.log(`✅ 修改完成！共修改了 ${modifiedFiles.length} 个文件`);
    return modifiedFiles;
  }
}

// 主函数
async function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('rollback')) {
    const modifier = new AntiDetectionModifier();
    modifier.rollback();
    return;
  }
  
  if (args.includes('validate')) {
    const modifier = new AntiDetectionModifier();
    const targetFiles = await modifier.scanAllFiles();
    modifier.validateModifications(targetFiles);
    return;
  }
  
  const modifier = new AntiDetectionModifier();
  const modifiedFiles = await modifier.apply();
  
  console.log('\n📋 后续步骤:');
  console.log('1. npm run build  # 构建修改后的代码');
  console.log('2. npm run build:driver  # 构建自定义driver包');
  console.log('3. npm run anti-detection:rollback  # 如需回滚');
}

// 运行
if (require.main === module) {
  main().catch(error => {
    console.error('❌ 执行失败:', error.message);
    process.exit(1);
  });
}

module.exports = { AntiDetectionModifier };