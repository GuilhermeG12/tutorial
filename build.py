"""Rebuild Tecla Cifra 4.9 with recovered assets and native speech improvements."""
import argparse
import pathlib
import shutil
import subprocess
import sys
import zipfile
from patch_native import patch
root=pathlib.Path(__file__).resolve().parent
parser=argparse.ArgumentParser()
parser.add_argument('--base',required=True,type=pathlib.Path)
parser.add_argument('--apktool',required=True,type=pathlib.Path)
parser.add_argument('--signer',required=True,type=pathlib.Path)
args=parser.parse_args()
work=root/'build/base';out=root/'build/output';out.mkdir(parents=True,exist_ok=True)
subprocess.run([sys.executable,str(root/'compile_native.py')],check=True)
subprocess.run(['java','-jar',str(args.apktool.resolve()),'d','-f',str(args.base.resolve()),'-o',str(work)],check=True)
patch(work)
p=work/'AndroidManifest.xml';text=p.read_text().replace('package="com.teclacifra.app"','package="com.teclacifra.fix"').replace('android:name=".MainActivity"','android:name="com.teclacifra.app.MainActivity"').replace('android:name=".CaptureService"','android:name="com.teclacifra.app.CaptureService"').replace('android:label="TeclaCifra"','android:label="TeclaCifra 4.9"')
text=text.replace('    <application ','    <supports-screens android:smallScreens="true" android:normalScreens="true" android:largeScreens="true" android:xlargeScreens="true" android:anyDensity="true" android:resizeable="true"/>\n    <uses-feature android:name="android.hardware.microphone" android:required="false"/>\n    <uses-feature android:name="android.hardware.touchscreen" android:required="false"/>\n    <application android:extractNativeLibs="true" android:resizeableActivity="true" ')
p.write_text(text)
p=work/'apktool.yml';p.write_text(p.read_text().replace('versionCode: 11','versionCode: 14').replace('versionName: 4.7','versionName: 4.9'))
for asset in (root/'assets').iterdir():
    if asset.is_file():shutil.copyfile(asset,work/'assets'/asset.name)
apk=out/'TeclaCifra-4.9-unsigned.apk'
subprocess.run(['java','-jar',str(args.apktool.resolve()),'b',str(work),'-o',str(apk)],check=True)
aligned=out/'aligned';aligned.mkdir(exist_ok=True)
subprocess.run(['java','-jar',str(args.signer.resolve()),'-a',str(apk),'-o',str(aligned)],check=True)
with zipfile.ZipFile(args.signer) as archive:
    signing_jar=out/'apksigner.jar';signing_key=out/'debug.keystore'
    signing_jar.write_bytes(archive.read('lib/apksigner_33_0_2.jar'));signing_key.write_bytes(archive.read('debug.keystore'))
aligned_apk=aligned/apk.name
if not aligned_apk.exists():aligned_apk=aligned/'TeclaCifra-4.9-aligned-debugSigned.apk'
final=out/'TeclaCifra-4.9.apk'
subprocess.run(['java','-jar',str(signing_jar),'sign','--ks',str(signing_key),'--ks-pass','pass:android','--key-pass','pass:android','--v1-signing-enabled','true','--v2-signing-enabled','true','--v3-signing-enabled','true','--out',str(final),str(aligned_apk)],check=True)
subprocess.run(['java','-jar',str(signing_jar),'verify','--verbose',str(final)],check=True)
print('APK ready:',final)
