import { contentSecurityPolicy } from './lib/security-headers.js';

const config = {
  distDir: process.env.VOID_BUILD_DIR || '.next',
  poweredByHeader: false,
  // The supplied Lupin master is 56 MB; only optimized variants reach browsers.
  images: { maximumResponseBody: 64 * 1024 * 1024,remotePatterns:['image.tmdb.org','cdn.myanimelist.net','s4.anilist.co','s3.anilist.co','assets.fanart.tv'].map(hostname=>({protocol:'https',hostname,pathname:'/**'})) },
  outputFileTracingIncludes:{'/api/review-share/*':['./node_modules/@fontsource/poppins/files/poppins-latin-400-normal.woff','./node_modules/@fontsource/poppins/files/poppins-latin-700-normal.woff','./node_modules/@fontsource/poppins/files/poppins-latin-600-normal.woff']},
  async headers() {
    return [{source:'/universos/optimized/:path*',headers:[{key:'Cache-Control',value:'public, max-age=31536000, immutable'}]}, { source: '/:path*', headers: [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
      { key: 'Content-Security-Policy', value: contentSecurityPolicy({ development: process.env.NODE_ENV !== 'production', supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL }) },
    ] }];
  },
};
export default config;
