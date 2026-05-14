// Sitemap data with all URLs
const sitemapData = [
    {
        loc: 'https://upiexpress.com/',
        lastmod: new Date().toISOString().split('T')[0],
        changefreq: 'daily',
        priority: '1.0'
    },
    {
        loc: 'https://upiexpress.com/pricing',
        lastmod: new Date().toISOString().split('T')[0],
        changefreq: 'weekly',
        priority: '0.9'
    },
    {
        loc: 'https://upiexpress.com/features',
        lastmod: new Date().toISOString().split('T')[0],
        changefreq: 'weekly',
        priority: '0.9'
    },
    {
        loc: 'https://upiexpress.com/usecases',
        lastmod: new Date().toISOString().split('T')[0],
        changefreq: 'weekly',
        priority: '0.9'
    },
    {
        loc: 'https://upiexpress.com/doc',
        lastmod: new Date().toISOString().split('T')[0],
        changefreq: 'weekly',
        priority: '0.9'
    },
    {
        loc: 'https://upiexpress.com/about-us',
        lastmod: new Date().toISOString().split('T')[0],
        changefreq: 'monthly',
        priority: '0.8'
    },
    {
        loc: 'https://upiexpress.com/blog',
        lastmod: new Date().toISOString().split('T')[0],
        changefreq: 'weekly',
        priority: '0.8'
    },
    {
        loc: 'https://upiexpress.com/faq',
        lastmod: new Date().toISOString().split('T')[0],
        changefreq: 'weekly',
        priority: '0.8'
    },
    {
        loc: 'https://upiexpress.com/help',
        lastmod: new Date().toISOString().split('T')[0],
        changefreq: 'weekly',
        priority: '0.8'
    },
    {
        loc: 'https://upiexpress.com/contact-us',
        lastmod: new Date().toISOString().split('T')[0],
        changefreq: 'weekly',
        priority: '0.8'
    },
    {
        loc: 'https://upiexpress.com/privacy',
        lastmod: new Date().toISOString().split('T')[0],
        changefreq: 'monthly',
        priority: '0.7'
    },
    {
        loc: 'https://upiexpress.com/terms',
        lastmod: new Date().toISOString().split('T')[0],
        changefreq: 'monthly',
        priority: '0.7'
    },
    {
        loc: 'https://upiexpress.com/refund',
        lastmod: new Date().toISOString().split('T')[0],
        changefreq: 'monthly',
        priority: '0.7'
    },
    {
        loc: 'https://upiexpress.com/account_access_policey',
        lastmod: new Date().toISOString().split('T')[0],
        changefreq: 'monthly',
        priority: '0.7'
    },
    {
        loc: 'https://upiexpress.com/auth/login',
        changefreq: 'monthly',
        priority: '0.5'
    },
    {
        loc: 'https://upiexpress.com/auth/signup',
        changefreq: 'monthly',
        priority: '0.6'
    }
];

// Generate sitemap.xml
function generateSitemap() {
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';

    sitemapData.forEach(url => {
        xml += '    <url>\n';
        xml += `        <loc>${url.loc}</loc>\n`;
        if (url.lastmod) {
            xml += `        <lastmod>${url.lastmod}</lastmod>\n`;
        }
        xml += `        <changefreq>${url.changefreq}</changefreq>\n`;
        xml += `        <priority>${url.priority}</priority>\n`;
        xml += '    </url>\n';
    });

    xml += '</urlset>';
    return xml;
}

// Generate sitemap-index.xml
function generateSitemapIndex() {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
    <sitemap>
        <loc>https://upiexpress.com/sitemap.xml</loc>
    </sitemap>
</sitemapindex>`;
    return xml;
}
// Generate robots.txt
function generateRobots() {
    const txt = `User-agent: *
Allow: /
Allow: /auth/login
Allow: /auth/signup
Allow: /api/create_order
Allow: /api/check_order_status
Allow: /sitemap.xml
Allow: /robots.txt

Disallow: /admin/
Disallow: /server/
Disallow: /api/webhook
Disallow: /api/webhook
Disallow: */admin
Disallow: */dashboard

# Google Bot specific
User-agent: Googlebot
Allow: /

# Bing Bot specific
User-agent: Bingbot
Allow: /

Crawl-delay: 1
Request-rate: 1/1s

Sitemap: https://upiexpress.com/sitemap.xml
Sitemap: https://upiexpress.com/sitemap-index.xml`;
    return txt;
}

module.exports = {
    generateSitemap,
    generateSitemapIndex,
    generateRobots,
    sitemapData
};
