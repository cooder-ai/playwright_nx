#!/usr/bin/env python3

"""
灵活的Playwright反检测修改脚本
- 基于配置文件进行变量替换
- 支持回滚和代码同步
- 生成patch文件便于版本管理
"""

import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Dict, List

class AntiDetectionModifier:
    def __init__(self, config_path: str = "anti-detection-config.json"):
        self.root_path = Path(__file__).parent.parent
        self.config_path = self.root_path / config_path
        self.config = self._load_config()
        self.backup_dir = self.root_path / ".anti-detection-backup"
        
    def _load_config(self) -> Dict:
        """加载配置文件"""
        with open(self.config_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    
    def scan_all_files(self) -> List[Path]:
        """扫描所有需要处理的文件"""
        target_files = []
        
        # 优先处理配置中指定的目标文件
        for target_file in self.config["file_patterns"]["target_files"]:
            file_path = self.root_path / target_file
            if file_path.exists():
                target_files.append(file_path)
        
        # 扫描其他相关文件
        search_dirs = [
            "packages/playwright-core/src",
            "packages/injected/src", 
            "packages/playwright-ct-core/src"
        ]
        
        for search_dir in search_dirs:
            dir_path = self.root_path / search_dir
            if dir_path.exists():
                for pattern in self.config["file_patterns"]["search_patterns"]:
                    if pattern.startswith("**/"):
                        pattern = pattern[3:]  # 移除 **/ 前缀
                    files = list(dir_path.glob(f"**/*{pattern}"))
                    target_files.extend(files)
        
        # 去重并过滤存在的文件
        return list(set([f for f in target_files if f.exists()]))
    
    def backup_original_files(self, target_files: List[Path]):
        """备份原始文件"""
        if self.config["sync_strategy"]["backup_original"]:
            print("📁 备份原始文件...")
            self.backup_dir.mkdir(exist_ok=True)
            
            for file_path in target_files:
                # 保持目录结构的备份
                rel_path = file_path.relative_to(self.root_path)
                backup_path = self.backup_dir / rel_path
                backup_path.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(file_path, backup_path)
                print(f"  备份: {rel_path}")

    def apply_replacements(self, target_files: List[Path]):
        """应用变量替换"""
        print("🔧 应用反检测变量替换...")
        
        # 合并所有变量替换规则
        all_replacements = {}
        for category, mappings in self.config["variable_replacements"].items():
            all_replacements.update(mappings)
        
        modified_files = []
        
        for file_path in target_files:
            try:
                with open(file_path, 'r', encoding='utf-8') as f:
                    content = f.read()
                
                original_content = content
                replacements_made = []
                
                # 应用所有替换规则 - 简单的字符串替换
                for old_var, new_var in all_replacements.items():
                    if old_var in content:
                        content = content.replace(old_var, new_var)
                        replacements_made.append(f"{old_var} -> {new_var}")
                
                if content != original_content:
                    with open(file_path, 'w', encoding='utf-8') as f:
                        f.write(content)
                    
                    rel_path = file_path.relative_to(self.root_path)
                    modified_files.append(rel_path)
                    print(f"  ✅ 修改 {rel_path}: {', '.join(replacements_made)}")
            
            except Exception as e:
                rel_path = file_path.relative_to(self.root_path)
                print(f"  ❌ 处理失败 {rel_path}: {e}")
        
        return modified_files

    def create_patch(self, modified_files: List[Path]):
        """创建patch文件便于版本管理"""
        if self.config["sync_strategy"]["create_patch"]:
            print("📄 创建patch文件...")
            
            patch_content = []
            for file_path in modified_files:
                backup_path = self.backup_dir / file_path
                target_path = self.root_path / file_path
                
                if backup_path.exists():
                    # 生成单个文件的diff
                    result = subprocess.run([
                        "git", "diff", "--no-index", 
                        str(backup_path), str(target_path)
                    ], capture_output=True, text=True, cwd=self.root_path)
                    
                    if result.stdout:
                        patch_content.append(result.stdout)
            
            if patch_content:
                patch_file = self.root_path / "anti-detection.patch"
                with open(patch_file, 'w', encoding='utf-8') as f:
                    f.write('\n'.join(patch_content))
                print(f"  ✅ Patch文件: {patch_file}")

    def rollback(self):
        """回滚所有修改"""
        if not self.backup_dir.exists():
            print("❌ 没有找到备份目录")
            return
            
        print("🔄 回滚修改...")
        restored_count = 0
        
        # 遍历备份目录，恢复所有文件
        for backup_file in self.backup_dir.rglob("*"):
            if backup_file.is_file():
                # 计算原始文件路径
                rel_path = backup_file.relative_to(self.backup_dir)
                original_file = self.root_path / rel_path
                
                if original_file.exists():
                    shutil.copy2(backup_file, original_file)
                    print(f"  ✅ 恢复: {rel_path}")
                    restored_count += 1
        
        print(f"✅ 回滚完成，恢复了 {restored_count} 个文件")

    def validate_modifications(self, target_files: List[Path]):
        """验证修改是否成功"""
        print("🔍 验证修改结果...")
        
        all_replacements = {}
        for category, mappings in self.config["variable_replacements"].items():
            all_replacements.update(mappings)
        
        for file_path in target_files:
            try:
                with open(file_path, 'r', encoding='utf-8') as f:
                    content = f.read()
                
                rel_path = file_path.relative_to(self.root_path)
                
                # 检查原始变量是否还存在
                remaining_vars = []
                for old_var in all_replacements.keys():
                    if old_var in content:
                        remaining_vars.append(old_var)
                
                if remaining_vars:
                    print(f"  ⚠️  {rel_path} 中仍有原始变量: {', '.join(remaining_vars)}")
                
                # 检查新变量是否存在
                new_vars_found = []
                for new_var in all_replacements.values():
                    if new_var in content:
                        new_vars_found.append(new_var)
                
                if new_vars_found:
                    print(f"  ✅ {rel_path} 中找到新变量: {', '.join(new_vars_found)}")
            
            except Exception as e:
                rel_path = file_path.relative_to(self.root_path)
                print(f"  ❌ 验证失败 {rel_path}: {e}")

    def apply(self):
        """执行完整的修改流程"""
        print("🚀 开始应用Playwright反检测修改...")
        print(f"📝 配置: {self.config['description']}")
        
        # 1. 扫描所有文件
        target_files = self.scan_all_files()
        print(f"📁 发现 {len(target_files)} 个文件需要处理")
        
        # 2. 备份原始文件
        self.backup_original_files(target_files)
        
        # 3. 应用替换
        modified_files = self.apply_replacements(target_files)
        
        # 4. 创建patch
        self.create_patch(modified_files)
        
        # 5. 验证修改
        self.validate_modifications([self.root_path / f for f in modified_files])
        
        print(f"✅ 修改完成！共修改了 {len(modified_files)} 个文件")
        return modified_files

def main():
    if len(sys.argv) > 1:
        if sys.argv[1] == "rollback":
            modifier = AntiDetectionModifier()
            modifier.rollback()
            return
        elif sys.argv[1] == "validate":
            modifier = AntiDetectionModifier()
            target_files = modifier.scan_all_files()
            modifier.validate_modifications(target_files)
            return
    
    modifier = AntiDetectionModifier()
    modified_files = modifier.apply()
    
    print("\n📋 后续步骤:")
    print("1. npm run build  # 构建修改后的代码")
    print("2. bash scripts/build-custom-driver.sh  # 构建自定义driver包")
    print("3. python scripts/apply-anti-detection.py rollback  # 如需回滚")

if __name__ == "__main__":
    main()