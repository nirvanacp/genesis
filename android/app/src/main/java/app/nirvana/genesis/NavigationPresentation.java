package app.nirvana.genesis;

import android.content.Context;
import android.content.res.Configuration;
import android.graphics.Color;
import android.net.Uri;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import org.json.JSONObject;

/** Opaque, host-owned destination recovery. No source content or query values. */
final class NavigationPresentation extends ScrollView {
    NavigationPresentation(Context context, JSONObject decision, Runnable back, Runnable website) {
        super(context);
        boolean dark=(context.getResources().getConfiguration().uiMode&Configuration.UI_MODE_NIGHT_MASK)==Configuration.UI_MODE_NIGHT_YES;
        int ink=dark?Color.WHITE:Color.BLACK;
        setBackgroundColor(dark?Color.BLACK:Color.WHITE);setFillViewport(true);setClickable(true);
        LinearLayout body=new LinearLayout(context);body.setOrientation(LinearLayout.VERTICAL);
        int inset=(int)(24*context.getResources().getDisplayMetrics().density);body.setPadding(inset,inset,inset,inset);addView(body);
        TextView title=new TextView(context);title.setText(decision.optString("title","Page unavailable"));title.setTextSize(24);title.setTextColor(ink);body.addView(title);
        TextView explanation=new TextView(context);explanation.setText(decision.optString("reason","This page needs the original website."));explanation.setTextSize(16);explanation.setTextColor(ink);body.addView(explanation);
        String url=decision.optJSONObject("target")==null?"":decision.optJSONObject("target").optString("url");
        Uri uri=Uri.parse(url);TextView origin=new TextView(context);origin.setText(uri.getHost()==null?"":uri.getScheme()+"://"+uri.getAuthority());origin.setTextColor(ink);body.addView(origin);
        Button previous=new Button(context);previous.setText("Back to applet");previous.setAllCaps(false);previous.setOnClickListener(v->back.run());body.addView(previous);
        if(decision.optBoolean("websiteAllowed")){Button open=new Button(context);open.setText("Continue on website");open.setAllCaps(false);open.setOnClickListener(v->website.run());body.addView(open);}
        title.setFocusable(true);title.requestFocus();
    }
}
