/**
 * AppLoadingScreen
 * Canvas roots splash — organic branches grow from corners, retrace, reveal app
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  FadeIn,
  runOnJS,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { WebView } from 'react-native-webview';

const DEFAULT_TIMEOUT_MS = 15000;

// ─── Canvas Roots Animation ─────────────────────────────────────
const getSplashHTML = (isDark) => {
  const bg = isDark ? '#0A0F1A' : '#F9FAFB';
  // Dark mode: white roots with light purple/cyan tips
  // Light mode: dark roots with purple/cyan tips
  const blStart = isDark ? '[220,220,240]' : '[27,35,65]';
  const blEnd = isDark ? '[192,132,252]' : '[139,92,246]';
  const trStart = isDark ? '[220,220,240]' : '[27,35,65]';
  const trEnd = isDark ? '[103,232,249]' : '[34,211,238]';

  return `<!DOCTYPE html><html><head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>*{margin:0;padding:0;overflow:hidden}body,html{width:100%;height:100%;background:${bg}}canvas{display:block}</style>
</head><body><canvas id="c"></canvas>
<script>
(function(){
var c=document.getElementById('c'),ctx=c.getContext('2d');
var dpr=window.devicePixelRatio||1;
var W=window.innerWidth,H=window.innerHeight;
c.width=W*dpr;c.height=H*dpr;
c.style.width=W+'px';c.style.height=H+'px';
ctx.scale(dpr,dpr);

var _s=33417658;
function rng(){_s=(_s+0x6D2B79F5)|0;var t=Math.imul(_s^(_s>>>15),1|_s);t=t+Math.imul(t^(t>>>7),61|t)^t;return((t^(t>>>14))>>>0)/4294967296}

var BR=[];
function add(sx,sy,ang,len,w,cs,ce,dep,sT){
  if(dep>2||len<8)return;
  var n=Math.max(3,Math.floor(len/3)),pts=[{x:sx,y:sy}];
  var x=sx,y=sy,a=ang;
  for(var i=0;i<n;i++){
    a+=(rng()-0.5)*0.4;
    x+=Math.cos(a)*3;y+=Math.sin(a)*3;
    pts.push({x:x,y:y});
    if(dep<2&&i>n*0.15&&i<n*0.8&&rng()<0.09){
      var ca=a+(rng()>0.5?1:-1)*(0.3+rng()*0.7);
      var cl=len*(0.2+rng()*0.25);
      var spT=sT+(1-sT)*(i/n);
      add(x,y,ca,cl,w*0.55,cs,ce,dep+1,spT);
    }
  }
  BR.push({pts:pts,w:w,cs:cs,ce:ce,sT:sT});
}

var diag=Math.sqrt(W*W+H*H);
var blN=2+Math.floor(rng()*2);
for(var i=0;i<blN;i++){
  var a=-Math.PI/4+(rng()-0.5)*0.8;
  var l=diag*0.35+rng()*diag*0.25;
  add(rng()*20,H-rng()*20,a,l,2+rng()*1,${blStart},${blEnd},0,0);
}
var trN=2+Math.floor(rng()*2);
for(var j=0;j<trN;j++){
  var a=Math.PI+Math.PI/6+(rng()-0.5)*0.6;
  var l=diag*0.35+rng()*diag*0.25;
  add(W-rng()*20,40+rng()*20,a,l,2+rng()*1,${trStart},${trEnd},0,0);
}

var DRAW=1200,HOLD=400,UNDRAW=1000,T=DRAW+HOLD+UNDRAW;
var t0=null,revOk=false,anOk=false,sent=false;
function ease(t){return t<0.5?2*t*t:1-Math.pow(-2*t+2,2)/2}
function go(){
  if(sent||!revOk||!anOk)return;sent=true;
  document.body.style.transition='opacity 0.4s ease-out';
  document.body.style.opacity='0';
  setTimeout(function(){if(window.ReactNativeWebView)window.ReactNativeWebView.postMessage('reveal-done')},420);
}

function frame(ts){
  if(!t0)t0=ts;
  var el=ts-t0,prog=0;
  if(el<DRAW){prog=ease(el/DRAW)}
  else if(el<DRAW+HOLD){prog=1}
  else if(el<T){prog=1-ease((el-DRAW-HOLD)/UNDRAW)}
  else{ctx.clearRect(0,0,W,H);anOk=true;go();return}

  ctx.clearRect(0,0,W,H);
  ctx.lineCap='round';
  for(var b=0;b<BR.length;b++){
    var br=BR[b],pts=br.pts;
    var ep=Math.max(0,(prog-br.sT)/(1-br.sT));
    var cnt=Math.floor(ep*(pts.length-1));
    if(cnt<1)continue;
    for(var i=0;i<cnt;i++){
      var t=i/(pts.length-1);
      ctx.beginPath();
      ctx.moveTo(pts[i].x,pts[i].y);
      ctx.lineTo(pts[i+1].x,pts[i+1].y);
      var r=br.cs[0]+(br.ce[0]-br.cs[0])*t;
      var g=br.cs[1]+(br.ce[1]-br.cs[1])*t;
      var bl=br.cs[2]+(br.ce[2]-br.cs[2])*t;
      ctx.strokeStyle='rgba('+Math.round(r)+','+Math.round(g)+','+Math.round(bl)+','+(1-t*0.3)+')';
      ctx.lineWidth=br.w*(1-t*0.5);
      ctx.stroke();
    }
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
window.startReveal=function(){revOk=true;go()};
})();
</script>
</body></html>`;
};

// ─── Main Component ────────────────────────────────────────────
export default function AppLoadingScreen({
  timeoutMs = DEFAULT_TIMEOUT_MS,
  onTimeout,
  onRetry,
  error = null,
  minDisplayMs = 0,
  isContentReady = false,
  onDismissComplete,
  isDark = false,
}) {
  const { t } = useTranslation('common');
  const [hasTimedOut, setHasTimedOut] = useState(false);
  const [minTimePassed, setMinTimePassed] = useState(!minDisplayMs);
  const timeoutRef = useRef(null);
  const dismissingRef = useRef(false);
  const revealDoneRef = useRef(false);
  const webViewRef = useRef(null);

  // Android fallback: opacity fade
  const fadeOutOpacity = useSharedValue(1);

  // Minimum display timer — ensures full animation sequence plays
  useEffect(() => {
    if (!minDisplayMs) return;
    const timer = setTimeout(() => setMinTimePassed(true), minDisplayMs);
    return () => clearTimeout(timer);
  }, [minDisplayMs]);

  // Trigger dismiss when content ready and min time elapsed
  useEffect(() => {
    if (isContentReady && minTimePassed && !error && !hasTimedOut && !dismissingRef.current) {
      dismissingRef.current = true;

      if (Platform.OS === 'ios' && webViewRef.current) {
        // iOS: SVG animation fade-out via WebView
        webViewRef.current.injectJavaScript('window.startReveal && window.startReveal(); true;');

        // Fallback: if WebView never responds, force dismiss
        setTimeout(() => {
          if (!revealDoneRef.current && onDismissComplete) {
            onDismissComplete();
          }
        }, 3500);
      } else {
        // Android / fallback: simple opacity fade
        fadeOutOpacity.value = withTiming(0, { duration: 400 }, (finished) => {
          if (finished && onDismissComplete) {
            runOnJS(onDismissComplete)();
          }
        });
      }
    }
  }, [isContentReady, minTimePassed, error, hasTimedOut]);

  // Handle message from WebView when reveal animation completes
  const handleWebViewMessage = useCallback((event) => {
    if (event.nativeEvent.data === 'reveal-done') {
      revealDoneRef.current = true;
      if (onDismissComplete) onDismissComplete();
    }
  }, [onDismissComplete]);

  // Timeout handling
  useEffect(() => {
    timeoutRef.current = setTimeout(() => {
      setHasTimedOut(true);
      if (onTimeout) onTimeout();
    }, timeoutMs);

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [timeoutMs, onTimeout]);

  const handleRetry = useCallback(() => {
    setHasTimedOut(false);
    dismissingRef.current = false;
    revealDoneRef.current = false;
    fadeOutOpacity.value = 1;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      setHasTimedOut(true);
      if (onTimeout) onTimeout();
    }, timeoutMs);
    if (onRetry) onRetry();
  }, [timeoutMs, onTimeout, onRetry]);

  const fadeOutStyle = useAnimatedStyle(() => ({
    opacity: fadeOutOpacity.value,
  }));

  // ─── Error State ───────────────────────────────────────────
  if (error || hasTimedOut) {
    return (
      <View style={styles.container}>
        <LinearGradient
          colors={isDark ? ['#0A0F1A', '#0F172A', '#1A1F3A'] : ['#F9FAFB', '#E5E7EB', '#D1D5DB']}
          style={StyleSheet.absoluteFillObject}
        />
        <Animated.View
          entering={FadeIn.duration(300)}
          style={styles.errorContent}
        >
          <View style={styles.errorIconContainer}>
            <Ionicons
              name={error ? 'alert-circle-outline' : 'cloud-offline-outline'}
              size={44}
              color="#F87171"
            />
          </View>
          <Text style={[styles.errorTitle, isDark && { color: '#F8FAFC' }]}>
            {error ? t('appLoading.connectionError') : t('appLoading.takingTooLong')}
          </Text>
          <Text style={[styles.errorMessage, isDark && { color: '#94A3B8' }]}>
            {error
              ? t('appLoading.checkConnection')
              : t('appLoading.slowerThanExpected')}
          </Text>
          {onRetry && (
            <TouchableOpacity
              style={styles.retryButton}
              onPress={handleRetry}
              activeOpacity={0.8}
            >
              <Ionicons name="refresh" size={18} color="#fff" />
              <Text style={styles.retryButtonText}>{t('appLoading.tryAgain')}</Text>
            </TouchableOpacity>
          )}
        </Animated.View>
      </View>
    );
  }

  // ─── Loading State ─────────────────────────────────────────
  return (
    <Animated.View
      style={[
        styles.container,
        fadeOutStyle,
        { backgroundColor: 'transparent' },
      ]}
    >
      {/* Roots animation */}
      <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
        <WebView
          ref={webViewRef}
          source={{ html: getSplashHTML(isDark) }}
          style={styles.shaderWebView}
          scrollEnabled={false}
          bounces={false}
          javaScriptEnabled={true}
          originWhitelist={['*']}
          allowsInlineMediaPlayback={true}
          overScrollMode="never"
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
          androidLayerType="hardware"
          onMessage={handleWebViewMessage}
        />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'transparent',
  },

  shaderWebView: {
    flex: 1,
    backgroundColor: 'transparent',
  },

  // ── Error State ───────────────────────────────────────
  errorContent: {
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  errorIconContainer: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#F8717115',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 8,
    textAlign: 'center',
  },
  errorMessage: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
    marginBottom: 28,
    lineHeight: 20,
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#3B82F6',
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: 10,
    gap: 8,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
});
