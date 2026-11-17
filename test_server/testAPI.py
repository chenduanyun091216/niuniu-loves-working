#!/usr/bin/env python3
"""Set macOS file dates and MP4 container/track/media dates in order."""

import argparse
import os
import random
import shutil
import subprocess
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo


# 在这里填写你的 MP4 文件完整路径，然后直接运行本脚本。
MP4_PATH = Path("/Users/chenduanyun/Desktop/关键要素智能分析诊断_培训视频.mp4")
START = datetime(2025, 1, 3, 8, 23, 12, tzinfo=ZoneInfo("Asia/Shanghai"))
TAGS = (
    "CreateDate",
    "TrackCreateDate",
    "MediaCreateDate",
    "MediaModifyDate",
    "TrackModifyDate",
    "ModifyDate",
)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mp4", nargs="?", type=Path, default=MP4_PATH, help="MP4 file to update")
    args = parser.parse_args()
    path = args.mp4.expanduser().resolve()
    if not path.is_file() or path.suffix.lower() != ".mp4":
        parser.error("Please provide an existing .mp4 file")
    original_atime = path.stat().st_atime
    if not shutil.which("exiftool"):
        parser.error("Missing exiftool; install it with 'brew install exiftool'")
    if not shutil.which("SetFile"):
        parser.error("Missing SetFile; install the macOS Xcode Command Line Tools")

    # Seven distinct seconds within one hour after the file creation time.
    offsets = sorted(random.SystemRandom().sample(range(1, 3601), 7))
    dates = [START + timedelta(seconds=seconds) for seconds in offsets]
    metadata_dates = dates[:6]
    file_modified = dates[6]
    arguments = ["exiftool", "-overwrite_original", "-api", "QuickTimeUTC=1"]
    for tag, value in zip(TAGS, metadata_dates):
        arguments.append(f"-QuickTime:{tag}={value:%Y:%m:%d %H:%M:%S%z}")
    try:
        subprocess.run([*arguments, str(path)], check=True)

        # Write file times last because ExifTool rewrites the MP4 file.
        os.utime(path, (original_atime, file_modified.timestamp()))
        subprocess.run(["SetFile", "-d", START.strftime("%m/%d/%Y %H:%M:%S"), str(path)], check=True)
    except (OSError, subprocess.CalledProcessError) as error:
        parser.exit(1, f"Failed to update {path}: {error}\n")

    print(f"FileCreateDate: {START:%Y-%m-%d %H:%M:%S %z}")
    for tag, value in zip(TAGS, metadata_dates):
        print(f"{tag}: {value:%Y-%m-%d %H:%M:%S %z}")
    print(f"FileModifyDate: {file_modified:%Y-%m-%d %H:%M:%S %z}")


if __name__ == "__main__":
    main()
