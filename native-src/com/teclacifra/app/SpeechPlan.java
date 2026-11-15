package com.teclacifra.app;

import java.util.ArrayList;
import java.util.List;

/** Pure timing and level preparation, independent of Android and the model. */
public final class SpeechPlan {
    private SpeechPlan() {}

    public static List<double[]> regions(List<double[]> voice, double duration) {
        List<double[]> output = new ArrayList<double[]>();
        for (double[] interval : voice) {
            double start = Math.max(0, interval[0] - 0.30);
            double end = Math.min(duration, interval[1] + 0.30);
            if (!(end > start)) continue;
            double[] last = output.isEmpty() ? null : output.get(output.size() - 1);
            if (last != null && start - last[1] <= 0.75 && end - last[0] <= 26.0) {
                last[1] = Math.max(last[1], end);
            } else {
                // A VAD segment can exceed its configured maximum by a few
                // frames. Split with context instead of truncating the tail.
                while (end - start > 26.0) {
                    output.add(new double[]{start, start + 25.0});
                    start += 24.4;
                }
                output.add(new double[]{start, end});
            }
        }
        return output;
    }

    public static void prepare(float[] pcm) {
        if (pcm.length == 0) return;
        double mean = 0;
        for (int i = 0; i < pcm.length; i++) {
            if (Float.isNaN(pcm[i]) || Float.isInfinite(pcm[i])) pcm[i] = 0;
            mean += pcm[i];
        }
        mean /= pcm.length;
        double square = 0, peak = 0;
        for (int i = 0; i < pcm.length; i++) {
            double value = pcm[i] - mean;
            square += value * value;
            peak = Math.max(peak, Math.abs(value));
        }
        double rms = Math.sqrt(square / pcm.length);
        // Only lift quiet voiced excerpts, with a hard peak cap. Silence is
        // never turned into artificial speech, and no samples are removed.
        double gain = rms > 0.0008 && rms < 0.02 ? Math.min(3.0, 0.045 / rms) : 1.0;
        if (peak > 0) gain = Math.min(gain, 0.95 / peak);
        for (int i = 0; i < pcm.length; i++) pcm[i] = (float)((pcm[i] - mean) * gain);
    }

    public static String identity(String word) {
        return word.toLowerCase(java.util.Locale.ROOT).replaceAll("[^\\p{L}\\p{N}]", "");
    }

    public static String cleanWord(String word) {
        // Whisper's non-speech markers are model output, never song lyrics.
        // A marker may share a token/word with the preceding punctuation.
        return word.replaceAll("(?i)\\[?BLANK[_ ]?AUDIO\\]?_?", "")
                .replaceAll("(?i)\\[(?:music|música|musica|silence|silêncio|silencio|applause|aplausos|inaudible|inaudível)\\]", "")
                .trim();
    }
}
