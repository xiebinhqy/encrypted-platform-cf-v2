// Frontend Worker - Serves static assets
// This is a minimal worker to support Cloudflare Workers deployment
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    // Try to serve from assets first
    try {
      return await env.ASSETS.fetch(request);
    } catch (e) {
      // If asset not found, return index.html for SPA routing
      if (url.pathname.startsWith('/api/')) {
        return new Response('API endpoint not available on frontend worker', { status: 404 });
      }
      return new Response('Not Found', { status: 404 });
    }
  }
};