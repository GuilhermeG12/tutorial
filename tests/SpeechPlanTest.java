import com.teclacifra.app.SpeechPlan;
import java.util.Arrays;
import java.util.List;

public final class SpeechPlanTest {
    private static void check(boolean value,String label){if(!value)throw new AssertionError(label);}
    public static void main(String[] args){
        List<double[]> regions=SpeechPlan.regions(Arrays.asList(new double[]{0.1,2},new double[]{2.5,4},new double[]{9,12}),12.1);
        check(regions.size()==2,"nearby voice intervals merge");
        check(regions.get(0)[0]==0,"padding never crosses audio start");
        check(regions.get(1)[1]==12.1,"padding never crosses audio end");
        List<double[]> longRegion=SpeechPlan.regions(Arrays.asList(new double[]{1,80}),81);
        check(longRegion.size()>2,"long segments split");
        check(longRegion.get(longRegion.size()-1)[1]>=80,"long segment tail retained");
        for(int i=0;i<longRegion.size();i++){
            check(longRegion.get(i)[1]-longRegion.get(i)[0]<=26.001,"bounded memory per excerpt");
            if(i>0)check(longRegion.get(i)[0]<longRegion.get(i-1)[1],"context overlap at long-segment boundaries");
        }
        float[] silent=new float[1600];SpeechPlan.prepare(silent);
        check(silent[0]==0&&silent.length==1600,"silence and duration remain unchanged");
        float[] quiet=new float[1600];for(int i=0;i<quiet.length;i++)quiet[i]=(float)(0.01*Math.sin(i*.1));
        SpeechPlan.prepare(quiet);double peak=0;for(float x:quiet)peak=Math.max(peak,Math.abs(x));
        check(peak>0.02&&peak<=0.95,"quiet voice gain is bounded");
        float[] bad={Float.NaN,Float.POSITIVE_INFINITY,-1,1};SpeechPlan.prepare(bad);
        for(float x:bad)check(!Float.isNaN(x)&&!Float.isInfinite(x)&&Math.abs(x)<=0.951,"finite unclipped PCM");
        check("country.".equals(SpeechPlan.cleanWord("country.BLANKAUDIO]_")),"attached hallucination marker removed");
        check(SpeechPlan.cleanWord("[Music]").isEmpty(),"non-speech marker removed");
        check("Música".equals(SpeechPlan.cleanWord("Música")),"a genuine lyric word is retained");
        check("coração".equals(SpeechPlan.identity("Coração!")),"accents preserved in word matching");
        System.out.println("SpeechPlan: segmentation, sample preparation and marker checks passed");
    }
}
