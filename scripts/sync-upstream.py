#!/usr/bin/env python3

"""
同步上游代码并重新应用反检测修改的脚本
确保我们能方便地跟上Playwright的更新
"""

import subprocess
import sys
from pathlib import Path

class UpstreamSync:
    def __init__(self):
        self.root_path = Path(__file__).parent.parent
        
    def sync_from_upstream(self, target_version: str = None):
        """从上游同步最新代码"""
        print("🔄 同步上游代码...")
        
        # 1. 添加上游remote（如果不存在）
        result = subprocess.run(
            ["git", "remote", "get-url", "upstream"], 
            capture_output=True, cwd=self.root_path
        )
        
        if result.returncode != 0:
            print("  添加上游remote...")
            subprocess.run([
                "git", "remote", "add", "upstream", 
                "https://github.com/microsoft/playwright.git"
            ], cwd=self.root_path, check=True)
        
        # 2. fetch上游更新
        subprocess.run(["git", "fetch", "upstream"], cwd=self.root_path, check=True)
        
        # 3. 切换到目标版本或最新tag
        if target_version:
            target = f"v{target_version}"
        else:
            # 获取最新的release tag
            result = subprocess.run([
                "git", "tag", "-l", "--sort=-version:refname", "v*"
            ], capture_output=True, text=True, cwd=self.root_path)
            target = result.stdout.strip().split('\n')[0]
        
        print(f"  目标版本: {target}")
        
        # 4. 创建新的反检测分支
        new_branch = f"{target}-anti-detection"
        try:
            subprocess.run([
                "git", "checkout", "-b", new_branch, target
            ], cwd=self.root_path, check=True)
            print(f"  ✅ 创建新分支: {new_branch}")
        except subprocess.CalledProcessError:
            subprocess.run([
                "git", "checkout", new_branch
            ], cwd=self.root_path, check=True)
            subprocess.run([
                "git", "reset", "--hard", target
            ], cwd=self.root_path, check=True)
            print(f"  ✅ 重置到新版本: {new_branch}")
        
        return new_branch, target
        
    def apply_anti_detection_patch(self):
        """应用反检测patch"""
        print("🛠️  应用反检测修改...")
        
        patch_file = self.root_path / "anti-detection.patch"
        if patch_file.exists():
            try:
                subprocess.run([
                    "git", "apply", str(patch_file)
                ], cwd=self.root_path, check=True)
                print("  ✅ Patch应用成功")
            except subprocess.CalledProcessError:
                print("  ⚠️  Patch应用失败，使用脚本重新生成...")
                # 回退到脚本应用
                subprocess.run([
                    "python", "scripts/apply-anti-detection.py"
                ], cwd=self.root_path, check=True)
        else:
            print("  使用脚本进行初次修改...")
            subprocess.run([
                "python", "scripts/apply-anti-detection.py"
            ], cwd=self.root_path, check=True)

    def update_config_version(self, version: str):
        """更新配置文件版本"""
        config_file = self.root_path / "anti-detection-config.json"
        with open(config_file, 'r', encoding='utf-8') as f:
            config = json.load(f)
        
        config["version"] = version
        
        with open(config_file, 'w', encoding='utf-8') as f:
            json.dump(config, f, indent=2, ensure_ascii=False)
        
        print(f"  ✅ 更新配置版本: {version}")

    def sync(self, target_version: str = None):
        """完整的同步流程"""
        print("🚀 开始同步上游并应用反检测修改...")
        
        # 1. 同步上游代码
        new_branch, target = self.sync_from_upstream(target_version)
        
        # 2. 更新配置版本
        version = target.replace('v', '')
        self.update_config_version(version)
        
        # 3. 应用反检测修改
        self.apply_anti_detection_patch()
        
        # 4. 构建验证
        print("🔨 构建修改后的代码...")
        try:
            subprocess.run(["npm", "run", "build"], cwd=self.root_path, check=True)
            print("  ✅ 构建成功")
        except subprocess.CalledProcessError:
            print("  ❌ 构建失败，请检查修改")
            return False
        
        # 5. 提交修改
        subprocess.run(["git", "add", "."], cwd=self.root_path)
        subprocess.run([
            "git", "commit", "-m", f"Apply anti-detection modifications for {target}"
        ], cwd=self.root_path)
        
        print(f"✅ 同步完成！新分支: {new_branch}")
        return True

def main():
    import argparse
    parser = argparse.ArgumentParser(description="同步上游代码并应用反检测修改")
    parser.add_argument("--version", help="目标版本 (如: 1.53.0)")
    parser.add_argument("--rollback", action="store_true", help="仅回滚修改")
    
    args = parser.parse_args()
    
    syncer = UpstreamSync()
    
    if args.rollback:
        from apply_anti_detection import AntiDetectionModifier
        modifier = AntiDetectionModifier()
        modifier.rollback()
    else:
        syncer.sync(args.version)

if __name__ == "__main__":
    main()