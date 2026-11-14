"""Rebuild the recovered interface while preserving original native binaries."""
import argparse
import pathlib
import shutil
import subprocess

root = pathlib.Path(__file__).resolve().parent
parser = argparse.ArgumentParser()
parser.add_argument('--base', required=True, type=pathlib.Path)
parser.add_argument('--apktool', required=True, type=pathlib.Path)
parser.add_argument('--signer', required=True, type=pathlib.Path)
args = parser.parse_args()
work = root / 'build' / 'base'
out = root / 'build' / 'output'
out.mkdir(parents=True, exist_ok=True)
subprocess.run(['java', '-jar', str(args.apktool.resolve()), 'd', '-s', '-f', str(args.base.resolve()), '-o', str(work)], check=True)
manifest = work / 'AndroidManifest.xml'
text = manifest.read_text().replace('package="com.teclacifra.app"', 'package="com.teclacifra.fix"')
text = text.replace('android:name=".MainActivity"', 'android:name="com.teclacifra.app.MainActivity"')
text = text.replace('android:name=".CaptureService"', 'android:name="com.teclacifra.app.CaptureService"')
text = text.replace('android:label="TeclaCifra"', 'android:label="TeclaCifra 4.8"')
manifest.write_text(text)
config = work / 'apktool.yml'
config.write_text(config.read_text().replace('versionCode: 11', 'versionCode: 12').replace('versionName: 4.7', 'versionName: 4.8'))
for asset in (root / 'assets').iterdir():
    if asset.is_file():
        shutil.copyfile(asset, work / 'assets' / asset.name)
apk = out / 'TeclaCifra-4.8-unsigned.apk'
subprocess.run(['java', '-jar', str(args.apktool.resolve()), 'b', str(work), '-o', str(apk)], check=True)
subprocess.run(['java', '-jar', str(args.signer.resolve()), '-a', str(apk), '-o', str(out / 'signed')], check=True)
