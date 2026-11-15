import com.teclacifra.app.SpeechPipeline;
import java.util.concurrent.CancellationException;
public class ChordsOnlyTest {
 public static void main(String[] args)throws Exception{
  SpeechPipeline.setProfile("chords-only");
  // Null context/file/progress intentionally prove that no audio/model loader
  // is touched in this mode. The independent chord worker is unchanged.
  if(SpeechPipeline.recognize(null,null,0,"pt",()->false,null).length()!=0)throw new AssertionError("Unexpected speech output");
  boolean cancelled=false;try{SpeechPipeline.recognize(null,null,0,"pt",()->true,null);}catch(CancellationException ok){cancelled=true;}
  if(!cancelled)throw new AssertionError("Cancellation ignored");
  SpeechPipeline.setProfile("precise");
  java.lang.reflect.Field field=SpeechPipeline.class.getDeclaredField("chordsOnly");field.setAccessible(true);
  if(field.getBoolean(null))throw new AssertionError("Mode leaked into next transcription");
  System.out.println("Chords-only native path: no model load, empty speech result, cancellation and reset passed");
 }
}
