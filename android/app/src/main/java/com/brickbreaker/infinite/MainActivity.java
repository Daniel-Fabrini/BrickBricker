package com.brickbreaker.infinite;

import android.os.Bundle;
import android.webkit.WebSettings;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    /** Upper bound for the WebView text zoom so large system font sizes cannot break the game layout. */
    private static final int MAX_TEXT_ZOOM = 115;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (getBridge() != null && getBridge().getWebView() != null) {
            WebSettings settings = getBridge().getWebView().getSettings();
            int systemZoom = Math.round(getResources().getConfiguration().fontScale * 100);
            settings.setTextZoom(Math.max(100, Math.min(MAX_TEXT_ZOOM, systemZoom)));
        }
    }
}
