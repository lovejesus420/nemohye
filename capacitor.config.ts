import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.nemohye.app',
  appName: '네모혜',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    // 앱 내 WebView에서 Anthropic API 직접 호출 허용
    allowNavigation: ['api.anthropic.com'],
  },
  plugins: {
    StatusBar: {
      style: 'dark',           // 상태바 아이콘 색상 (밝은 배경용)
      backgroundColor: '#0d1117',
      overlaysWebView: false,
    },
    SplashScreen: {
      launchShowDuration: 1500,
      backgroundColor: '#0d1117',
      androidSplashResourceName: 'splash',
      showSpinner: false,
    },
  },
  android: {
    buildOptions: {
      keystorePath: undefined,  // 서명 키 경로 (배포 시 설정)
      keystorePassword: undefined,
      keystoreAlias: undefined,
      keystoreAliasPassword: undefined,
    },
  },
};

export default config;
