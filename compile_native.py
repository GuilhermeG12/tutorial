"""Compile new classes against checked ABI stubs; package only our classes."""
import pathlib
import re
import shutil
import subprocess
import sys
import zipfile

root = pathlib.Path(__file__).resolve().parent
tools = root.parent / 'tools'
work = root / 'build' / 'native'
stubs = work / 'stubs'
classes = work / 'classes'
classes.mkdir(parents=True, exist_ok=True)

specs = {
    'com/k2fsa/sherpa/onnx/OfflineWhisperModelConfig': '''public OfflineWhisperModelConfig(){} public void setEncoder(String x){} public void setDecoder(String x){} public void setLanguage(String x){} public void setTask(String x){} public void setTailPaddings(int x){} public void setEnableTokenTimestamps(boolean x){} public void setEnableSegmentTimestamps(boolean x){}''',
    'com/k2fsa/sherpa/onnx/OfflineModelConfig': '''public OfflineModelConfig(){} public void setWhisper(OfflineWhisperModelConfig x){} public void setTokens(String x){} public void setProvider(String x){} public void setNumThreads(int x){}''',
    'com/k2fsa/sherpa/onnx/OfflineRecognizerConfig': '''public OfflineRecognizerConfig(){} public void setModelConfig(OfflineModelConfig x){}''',
    'com/k2fsa/sherpa/onnx/OfflineRecognizer': '''public OfflineRecognizer(android.content.res.AssetManager a,OfflineRecognizerConfig c){} public void release(){}''',
    'com/k2fsa/sherpa/onnx/SileroVadModelConfig': '''public SileroVadModelConfig(){} public void setModel(String x){} public void setThreshold(float x){} public void setMinSpeechDuration(float x){} public void setMinSilenceDuration(float x){} public void setMaxSpeechDuration(float x){}''',
    'com/k2fsa/sherpa/onnx/VadModelConfig': '''public VadModelConfig(){} public void setSileroVadModelConfig(SileroVadModelConfig x){} public void setSampleRate(int x){} public void setNumThreads(int x){}''',
    'com/k2fsa/sherpa/onnx/Vad': '''public Vad(android.content.res.AssetManager a,VadModelConfig c){} public void acceptWaveform(float[] p){} public void flush(){} public boolean empty(){return true;} public SpeechSegment front(){return null;} public void pop(){} public void release(){}''',
    'com/k2fsa/sherpa/onnx/SpeechSegment': '''public long getStart(){return 0;} public float[] getSamples(){return null;}''',
    'com/teclacifra/app/ChordFeatures': '''public static float[] readPcm(java.io.RandomAccessFile f,long n,long s,int c){return null;}''',
    'com/teclacifra/app/ModelFiles': '''public static java.io.File get(android.content.Context c,String p){return null;}''',
    'com/teclacifra/app/SpeechNetwork': '''public interface Progress{void update(double d,org.json.JSONArray a)throws Exception;} public static org.json.JSONArray recognizeLegacy(android.content.Context c,java.io.File f,long s,String l,java.util.function.BooleanSupplier b,Progress p)throws Exception{return null;} public static org.json.JSONArray decode(com.k2fsa.sherpa.onnx.OfflineRecognizer r,float[] p,double s,double e,java.util.List<double[]> v,java.util.function.BooleanSupplier b)throws Exception{return null;}''',
}
for path, body in specs.items():
    package, name = path.rsplit('/', 1)
    dest = stubs / (path + '.java')
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text('package ' + package.replace('/', '.') + '; public class ' + name + '{' + body + '}')

sources = sorted((root / 'native-src').rglob('*.java')) + sorted(stubs.rglob('*.java'))
subprocess.run(['java', 'com.sun.tools.javac.Main', '-source', '8', '-target', '8', '-encoding', 'UTF-8', '-classpath', str(tools / 'android.jar') + ':' + str(tools / 'json.jar'), '-d', str(classes)] + [str(p) for p in sources], check=True)
jar = work / 'patch.jar'
with zipfile.ZipFile(jar, 'w') as archive:
    for name in ['SpeechPlan', 'SpeechPipeline', 'ThemeSupport']:
        for p in (classes / 'com/teclacifra/app').glob(name + '*.class'):
            archive.write(p, p.relative_to(classes))
dex_dir = work / 'dex'
dex_dir.mkdir(exist_ok=True)
subprocess.run(['java', '-cp', str(tools / 'r8.jar'), 'com.android.tools.r8.D8', '--min-api', '26', '--lib', str(tools / 'android.jar'), '--output', str(dex_dir), str(jar)], check=True)
shell = work / 'patch.apk'
with zipfile.ZipFile(shell, 'w') as archive:
    archive.write(dex_dir / 'classes.dex', 'classes.dex')
decoded = work / 'decoded'
subprocess.run(['java', '-jar', str(tools / 'apktool.jar'), 'd', '-f', '-r', str(shell), '-o', str(decoded)], check=True)
print('Native patch compiled:', decoded / 'smali')
