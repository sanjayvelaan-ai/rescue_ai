#!/usr/bin/env python3
"""
GitHub File Size & Upload Safety Validator
Ensures no files exceed GitHub's 50MB warning threshold or 100MB hard limit.
"""
import os
import sys
import fnmatch
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent

# GitHub limits in bytes
GITHUB_ALERT_LIMIT = 50 * 1024 * 1024    # 50 MB (GitHub push warning)
GITHUB_HARD_BLOCK_LIMIT = 100 * 1024 * 1024  # 100 MB (GitHub push rejection)
INFO_THRESHOLD = 10 * 1024 * 1024        # 10 MB (Informational notice)

def load_gitignore_patterns(repo_root: Path) -> list[str]:
    gitignore_path = repo_root / ".gitignore"
    patterns = []
    if gitignore_path.exists():
        with open(gitignore_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#"):
                    patterns.append(line)
    # Always treat these standard ignored directories as skipped
    patterns.extend([".git", "venv", ".venv", "node_modules", ".pytest_cache"])
    return patterns

def is_ignored(rel_path: str, patterns: list[str]) -> bool:
    parts = rel_path.replace("\\", "/").split("/")
    norm_path = rel_path.replace("\\", "/")
    
    for pattern in patterns:
        clean_pat = pattern.rstrip("/").replace("\\", "/")
        if clean_pat.startswith("**/"):
            base_pat = clean_pat[3:]
            if any(fnmatch.fnmatch(part, base_pat) for part in parts):
                return True
            if fnmatch.fnmatch(norm_path, f"*{base_pat}*"):
                return True
        elif "/" in clean_pat:
            if fnmatch.fnmatch(norm_path, clean_pat) or fnmatch.fnmatch(norm_path, f"{clean_pat}/*"):
                return True
        else:
            if any(fnmatch.fnmatch(part, clean_pat) for part in parts):
                return True
    return False

def scan_repository():
    patterns = load_gitignore_patterns(REPO_ROOT)
    
    tracked_files = []
    ignored_large_files = []
    
    for root, dirs, files in os.walk(REPO_ROOT):
        # Exclude directories
        dirs[:] = [
            d for d in dirs 
            if d not in {'.git', 'venv', '.venv', 'node_modules', '__pycache__', '.pytest_cache'}
        ]
        
        for file in files:
            file_path = Path(root) / file
            rel_path = file_path.relative_to(REPO_ROOT)
            rel_str = str(rel_path)
            
            try:
                size = file_path.stat().st_size
            except OSError:
                continue
                
            ignored = is_ignored(rel_str, patterns)
            
            if size >= INFO_THRESHOLD:
                if ignored:
                    ignored_large_files.append((size, rel_str))
                else:
                    tracked_files.append((size, rel_str))

    tracked_files.sort(reverse=True, key=lambda x: x[0])
    ignored_large_files.sort(reverse=True, key=lambda x: x[0])

    print("=" * 70)
    print("  GITHUB UPLOAD & FILE SIZE PRE-FLIGHT CHECK")
    print("=" * 70)
    
    hard_blocks = [f for f in tracked_files if f[0] >= GITHUB_HARD_BLOCK_LIMIT]
    warnings = [f for f in tracked_files if GITHUB_ALERT_LIMIT <= f[0] < GITHUB_HARD_BLOCK_LIMIT]
    notices = [f for f in tracked_files if INFO_THRESHOLD <= f[0] < GITHUB_ALERT_LIMIT]

    print(f"\n[1] TRACKED CANDIDATES FOR GITHUB PUSH (>10MB): {len(tracked_files)} files found")
    if not tracked_files:
        print("  ✓ Excellent! No large files queued for GitHub push.")
    else:
        for size, path in tracked_files:
            size_mb = size / (1024 * 1024)
            if size >= GITHUB_HARD_BLOCK_LIMIT:
                tag = "[BLOCKED >100MB]"
            elif size >= GITHUB_ALERT_LIMIT:
                tag = "[ALERT >50MB]"
            else:
                tag = "[OK <50MB]"
            print(f"  {tag:<18} {size_mb:6.2f} MB  -> {path}")

    print(f"\n[2] IGNORED BY .gitignore (Safe from upload): {len(ignored_large_files)} files detected")
    for size, path in ignored_large_files[:10]:
        size_mb = size / (1024 * 1024)
        print(f"  [IGNORED]          {size_mb:6.2f} MB  -> {path}")
    if len(ignored_large_files) > 10:
        print(f"  ... and {len(ignored_large_files) - 10} more files correctly ignored.")

    print("\n" + "=" * 70)
    if hard_blocks:
        print(f"[-] RESULT: FAILED! {len(hard_blocks)} file(s) exceed GitHub's 100MB limit and will be rejected.")
        print("   Action: Add them to .gitignore or configure Git LFS.")
        return 1
    elif warnings:
        print(f"[!] RESULT: {len(warnings)} file(s) between 50MB and 100MB will trigger GitHub file size warnings.")
        print("   Recommendation: Compress or ignore if not required.")
        return 0
    else:
        print("[+] RESULT: PASSED! All repository files are 100% compliant with GitHub limits.")
        print("   No upload alerts or rejections will occur when pushing.")
        return 0

if __name__ == "__main__":
    sys.exit(scan_repository())
