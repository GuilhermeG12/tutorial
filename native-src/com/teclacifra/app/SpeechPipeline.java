package com.teclacifra.app;

import android.content.Context;
import com.k2fsa.sherpa.onnx.*;
import java.io.File;
import java.io.RandomAccessFile;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.CancellationException;
import java.util.function.BooleanSupplier;
import org.json.JSONArray;
import org.json.JSONObject;

/** Voice-region transcription retaining original audio timestamps. */
public final class SpeechPipeline {
    private static volatile boolean precise = true;
    private static volatile boolean chordsOnly = false;
    private static final int SR = 16000;
    private SpeechPipeline() {}

    public static void setProfile(String profile) {
        chordsOnly = "chords-only".equals(profile);
        precise = !"balanced".equals(profile);
    }

    private static void check(BooleanSupplier cancelled) {
        if (cancelled.getAsBoolean()) throw new CancellationException();
    }

    public static JSONArray recognize(Context context, File file, long samples,
            String language, BooleanSupplier cancelled, SpeechNetwork.Progress progress) throws Exception {
        check(cancelled);
        // In this mode the chord worker still analyzes the full PCM. The
        // speech worker finishes without loading Whisper, VAD or speech assets.
        if (chordsOnly) return new JSONArray();
        if (!precise) return SpeechNetwork.recognizeLegacy(context,file,samples,language,cancelled,progress);
        check(cancelled);
        final double duration = samples / (double)SR;
        List<double[]> speech = new ArrayList<double[]>();
        SileroVadModelConfig silero = new SileroVadModelConfig();
        silero.setModel(ModelFiles.get(context,"models/speech/silero_vad.onnx").getAbsolutePath());
        silero.setThreshold(0.25f);
        silero.setMinSpeechDuration(0.15f);
        silero.setMinSilenceDuration(0.60f);
        silero.setMaxSpeechDuration(24.0f);
        VadModelConfig vadConfig = new VadModelConfig();
        vadConfig.setSileroVadModelConfig(silero);
        vadConfig.setSampleRate(SR);
        vadConfig.setNumThreads(1);
        Vad vad = new Vad(null,vadConfig);
        try (RandomAccessFile input = new RandomAccessFile(file,"r")) {
            // Keep VAD state continuous across file blocks; do not reset it at
            // an arbitrary musical bar or every 20 seconds.
            for (long offset = 0; offset < samples; offset += 16000) {
                check(cancelled);
                float[] block = ChordFeatures.readPcm(input,samples,offset,(int)Math.min(16000,samples-offset));
                vad.acceptWaveform(block);
                drain(vad,speech,duration);
            }
            vad.flush();
            drain(vad,speech,duration);
        } finally { vad.release(); }
        progress.update(0.08,new JSONArray());
        List<double[]> regions = SpeechPlan.regions(speech,duration);
        if (regions.isEmpty()) { progress.update(1,new JSONArray()); return new JSONArray(); }

        OfflineWhisperModelConfig whisper = new OfflineWhisperModelConfig();
        whisper.setEncoder(ModelFiles.get(context,"models/speech/base-encoder-timed.int8.onnx").getAbsolutePath());
        whisper.setDecoder(ModelFiles.get(context,"models/speech/base-decoder-timed.int8.onnx").getAbsolutePath());
        whisper.setLanguage("auto".equals(language) ? "" : language);
        whisper.setTask("transcribe");
        whisper.setTailPaddings(300);
        whisper.setEnableTokenTimestamps(true);
        whisper.setEnableSegmentTimestamps(true);
        OfflineModelConfig model = new OfflineModelConfig();
        model.setWhisper(whisper);
        model.setTokens(ModelFiles.get(context,"models/speech/base-tokens.txt").getAbsolutePath());
        model.setProvider("cpu");
        model.setNumThreads(2);
        OfflineRecognizerConfig config = new OfflineRecognizerConfig();
        config.setModelConfig(model);
        OfflineRecognizer recognizer = new OfflineRecognizer(null,config);
        List<JSONObject> words = new ArrayList<JSONObject>();
        try (RandomAccessFile input = new RandomAccessFile(file,"r")) {
            for (int index = 0; index < regions.size(); index++) {
                check(cancelled);
                double[] region = regions.get(index);
                float[] pcm = read(input,samples,region[0],region[1]);
                SpeechPlan.prepare(pcm);
                JSONArray decoded = SpeechNetwork.decode(recognizer,pcm,region[0],region[1],
                        Collections.singletonList(region),cancelled);
                double covered = region[0];
                for(int i=0;i<decoded.length();i++)covered=Math.max(covered,decoded.getJSONObject(i).getDouble("t1"));
                // A second, bounded attempt only for an untranscribed vocal
                // tail. Retain the first pass when the retry adds no coverage.
                if(region[1]-covered>=2.5 && region[1]-region[0]>=3.0){
                    check(cancelled);
                    double retryStart=Math.max(region[0],covered-0.35);
                    double[] retryRegion={retryStart,region[1]};
                    float[] retryPcm=read(input,samples,retryStart,region[1]);
                    SpeechPlan.prepare(retryPcm);
                    JSONArray retry=SpeechNetwork.decode(recognizer,retryPcm,retryStart,region[1],
                            Collections.singletonList(retryRegion),cancelled);
                    for(int i=0;i<retry.length();i++){
                        JSONObject word=retry.getJSONObject(i);
                        if(word.getDouble("t0")>=covered-0.10){word.put("review",true);decoded.put(word);}
                    }
                }
                for(int i=0;i<decoded.length();i++)addUnique(words,decoded.getJSONObject(i),duration);
                Collections.sort(words,new java.util.Comparator<JSONObject>(){
                    public int compare(JSONObject a,JSONObject b){return Double.compare(a.optDouble("t0"),b.optDouble("t0"));}
                });
                progress.update(0.08+0.92*(index+1)/(double)regions.size(),snapshot(words));
            }
            return snapshot(words);
        } finally { recognizer.release(); }
    }

    private static float[] read(RandomAccessFile file,long samples,double start,double end) throws Exception {
        long first=Math.max(0,(long)Math.floor(start*SR));
        int count=(int)Math.max(0,Math.min(samples-first,(long)Math.ceil(end*SR)-first));
        return ChordFeatures.readPcm(file,samples,first,count);
    }
    private static void drain(Vad vad,List<double[]> output,double duration){
        while(!vad.empty()){
            SpeechSegment region=vad.front();
            double start=region.getStart()/(double)SR;
            double end=(region.getStart()+region.getSamples().length)/(double)SR;
            if(end>start)output.add(new double[]{Math.max(0,start),Math.min(duration,end)});
            vad.pop();
        }
    }
    private static void addUnique(List<JSONObject> words,JSONObject word,double duration) throws Exception {
        double start=word.getDouble("t0"),end=word.getDouble("t1");
        if(Double.isNaN(start)||Double.isInfinite(start)||Double.isNaN(end)||Double.isInfinite(end)||start<0||start>=duration||end<=start)return;
        String cleaned=SpeechPlan.cleanWord(word.getString("w"));
        String text=SpeechPlan.identity(cleaned);
        if(text.isEmpty())return;
        for(int i=words.size()-1;i>=0;i--){
            JSONObject previous=words.get(i);
            if(start-previous.getDouble("t0")>30)break;
            if(Math.abs(start-previous.getDouble("t0"))<0.45 && text.equals(SpeechPlan.identity(previous.getString("w"))))return;
        }
        word.put("w",cleaned).put("t1",Math.min(duration,end));words.add(word);
    }
    private static JSONArray snapshot(List<JSONObject> words){
        JSONArray result=new JSONArray();for(JSONObject word:words)result.put(word);return result;
    }
}

