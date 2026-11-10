/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  distDir: process.env.NEXT_BUILD_DIR || '.next',
  async headers() { const dev=process.env.NODE_ENV!=='production';const script=`'self' https://www.paypal.com https://www.sandbox.paypal.com https://www.paypalobjects.com${dev?" 'unsafe-inline' 'unsafe-eval'":" 'unsafe-inline'"}`;return [{source:'/:path*',headers:[{key:'X-Content-Type-Options',value:'nosniff'},{key:'Referrer-Policy',value:'strict-origin-when-cross-origin'},{key:'X-Frame-Options',value:'DENY'},{key:'Permissions-Policy',value:'camera=(), microphone=(), geolocation=()'},{key:'Content-Security-Policy',value:`default-src 'self'; script-src ${script}; frame-src https://www.paypal.com https://www.sandbox.paypal.com; connect-src 'self' https://www.paypal.com https://www.sandbox.paypal.com https://www.paypalobjects.com https://api-m.sandbox.paypal.com https://api-m.paypal.com; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; base-uri 'self'; frame-ancestors 'none'`}] }]; },
};
export default nextConfig;
