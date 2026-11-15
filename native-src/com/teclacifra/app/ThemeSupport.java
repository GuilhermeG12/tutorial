package com.teclacifra.app;

import android.app.Activity;
import android.view.View;
import android.view.Window;

public final class ThemeSupport {
    private ThemeSupport() {}
    public static void apply(final Activity activity,final String theme){
        activity.runOnUiThread(new Runnable(){public void run(){
            boolean dark="dark".equals(theme);
            int color=dark?0xff15171c:0xffffffff;
            Window window=activity.getWindow();
            try{
                window.getClass().getMethod("setStatusBarColor",int.class).invoke(window,color);
                window.getClass().getMethod("setNavigationBarColor",int.class).invoke(window,color);
            }catch(Exception ignored){}
            View decor=window.getDecorView();int flags=decor.getSystemUiVisibility();
            int lightBars=8192|16;
            decor.setSystemUiVisibility(dark?flags&~lightBars:flags|lightBars);
        }});
    }
}
