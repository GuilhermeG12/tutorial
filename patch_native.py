"""Install new classes and native entry points into the decoded APK."""
import pathlib
import re
import shutil
import sys
root = pathlib.Path(__file__).resolve().parent

def patch(base):
    smali=base/'smali'
    p=smali/'com/teclacifra/app/SpeechNetwork.smali'
    text=p.read_text().replace('.method private static decode(','.method public static decode(')
    sig='(Landroid/content/Context;Ljava/io/File;JLjava/lang/String;Ljava/util/function/BooleanSupplier;Lcom/teclacifra/app/SpeechNetwork$Progress;)Lorg/json/JSONArray;'
    if '.method public static recognizeLegacy(' not in text:
        text=text.replace('.method public static recognize(','.method public static recognizeLegacy(')
        text+='\n.method public static recognize'+sig+'\n    .locals 1\n    invoke-static/range {p0 .. p6}, Lcom/teclacifra/app/SpeechPipeline;->recognize'+sig+'\n    move-result-object v0\n    return-object v0\n.end method\n'
    p.write_text(text)
    p=smali/'com/teclacifra/app/MainActivity$Bridge.smali';text=p.read_text()
    if '.method public setSpeechQuality(' not in text:
        text+='''
.method public setSpeechQuality(Ljava/lang/String;)V
    .locals 0
    .annotation runtime Landroid/webkit/JavascriptInterface;
    .end annotation
    invoke-static {p1}, Lcom/teclacifra/app/SpeechPipeline;->setProfile(Ljava/lang/String;)V
    return-void
.end method
.method public setAppTheme(Ljava/lang/String;)V
    .locals 1
    .annotation runtime Landroid/webkit/JavascriptInterface;
    .end annotation
    iget-object v0, p0, Lcom/teclacifra/app/MainActivity$Bridge;->this$0:Lcom/teclacifra/app/MainActivity;
    invoke-static {v0, p1}, Lcom/teclacifra/app/ThemeSupport;->apply(Landroid/app/Activity;Ljava/lang/String;)V
    return-void
.end method
'''
    p.write_text(text)
    source=root/'build/native/decoded/smali/com/teclacifra/app'
    for p in source.glob('*.smali'):shutil.copyfile(p,smali/'com/teclacifra/app'/p.name)
    count=0
    for p in source.glob('*.smali'):
        for cls,method in re.findall(r'invoke-[^\n]+, L([^;]+);->([^\s]+)',p.read_text()):
            if cls.startswith(('com/k2fsa/','com/teclacifra/')):
                target=smali/(cls+'.smali');count+=1
                if not target.exists() or not re.search(r'^\.method [^\n]* '+re.escape(method)+'$',target.read_text(),re.M):raise RuntimeError('Native ABI mismatch: '+cls+'->'+method)
    print('Native ABI references verified:',count)

if __name__=='__main__':patch(pathlib.Path(sys.argv[1]))
